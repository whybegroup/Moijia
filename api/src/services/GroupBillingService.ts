import { PrismaClient } from '@prisma/client';
import { groupStorage } from './GroupStorageService';
import { NotificationService } from './NotificationService';
import { MAIL_FOOTER, sendOwnerEmail, type ReceiptSection } from './EmailService';
import { httpError } from '../utils/httpError';
import { monthPeriodExpiresAt, nextMonthlyAnniversary } from '../utils/groupPlanPeriod';
import { recordPurchase } from './PurchaseHistoryService';
import {
  FREE_OWNED_GROUP_LIMIT,
  GROUP_TIERS,
  formatStorageBytes,
  isPaidSizeTier,
  parseSizeTier,
  sizeTierRank,
  storageBytesToDb,
  storageCapForTier,
  type GroupSizeTier,
} from '../utils/groupStorageLimits';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export type PaidSizeTier = 'medium' | 'large';

export interface BillingEntitlementSnapshot {
  mediumActive: boolean;
  largeActive: boolean;
  mediumRenewing?: boolean;
  largeRenewing?: boolean;
}

function productIdForTier(tier: PaidSizeTier): string {
  return tier === 'large' ? 'subscription_large_group' : 'subscription_medium_group';
}

function formatMailDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function planReceipt(label: string): { name: string; price: string; storage: string } {
  if (label === 'Large') return { name: 'Large Group', price: '$9.99/mo', storage: '100 GB' };
  if (label === 'Medium') return { name: 'Medium Group', price: '$4.99/mo', storage: '10 GB' };
  return { name: 'Small Group', price: '$0.00/mo', storage: '1 GB' };
}

export class GroupBillingService {
  public async ownedGroupCount(userId: string): Promise<number> {
    return prisma.groupMember.count({
      where: {
        userId,
        role: 'owner',
        status: 'active',
        group: { deletedAt: null },
      },
    });
  }

  public async getOwnedGroupQuota(userId: string): Promise<{
    ownedGroupCount: number;
    ownedGroupLimit: number;
    groupCapacity: number;
    freeGroupLimit: number;
    extraGroupSlots: number;
    canCreateGroup: boolean;
  }> {
    const [ownedGroupCount, user] = await Promise.all([
      this.ownedGroupCount(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { ownedGroupLimit: true, extraGroupSlots: true },
      }),
    ]);
    const ownedGroupLimit = Math.max(1, user?.ownedGroupLimit ?? FREE_OWNED_GROUP_LIMIT);
    const extraGroupSlots = Math.max(0, user?.extraGroupSlots ?? 0);
    const groupCapacity = ownedGroupLimit + extraGroupSlots;
    return {
      ownedGroupCount,
      ownedGroupLimit,
      groupCapacity,
      freeGroupLimit: ownedGroupLimit,
      extraGroupSlots,
      canCreateGroup: ownedGroupCount < groupCapacity,
    };
  }

  public async assertCanCreateOwnedGroup(userId: string): Promise<void> {
    const quota = await this.getOwnedGroupQuota(userId);
    if (quota.canCreateGroup) return;
    throw httpError(
      403,
      `You cannot create more than ${quota.groupCapacity} groups. If you need more, contact an administrator.`,
      { code: 'owned_group_limit' }
    );
  }

  public async addExtraGroupSlot(userId: string): Promise<{ extraGroupSlots: number }> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw httpError(404, 'User not found');
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { extraGroupSlots: { increment: 1 } },
      select: { extraGroupSlots: true },
    });
    await recordPurchase({
      userId,
      kind: 'extra_group',
      title: 'Extra group slot',
      detail: '$0.99',
      productId: 'product_extra_group',
    });
    return { extraGroupSlots: updated.extraGroupSlots };
  }

  public async applyPaidSizeTier(input: {
    groupId: string;
    userId: string;
    sizeTier: PaidSizeTier;
    email?: string | null;
  }): Promise<{ maxStorageBytes: number; sizeTier: GroupSizeTier }> {
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        sizeTier: true,
        sizeStartedAt: true,
        pendingSizeTier: true,
      },
    });
    if (!group || group.deletedAt) throw httpError(404, 'Group not found');
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      select: { status: true, role: true },
    });
    if (!member || member.status !== 'active' || member.role !== 'owner') {
      throw httpError(403, 'Must be the group owner to change the group size');
    }

    const currentTier = parseSizeTier(group.sizeTier);
    const cap = storageCapForTier(input.sizeTier);
    if (input.sizeTier === currentTier) {
      const hadPending = !!group.pendingSizeTier;
      await this.clearGrace(input.groupId);
      if (hadPending) {
        await this.emailPlanUpdate({
          ownerId: input.userId,
          email: input.email,
          groupName: group.name,
          currentLabel: GROUP_TIERS[currentTier].label,
          nextLabel: GROUP_TIERS[input.sizeTier].label,
          immediate: true,
          startedAt: group.sizeStartedAt ?? new Date(),
        });
      }
      return { maxStorageBytes: cap, sizeTier: currentTier };
    }
    const isDowngrade = sizeTierRank(input.sizeTier) < sizeTierRank(currentTier);

    if (isDowngrade) {
      await this.startGrace(
        group.id,
        group.name,
        input.userId,
        input.sizeTier,
        null,
        'owner',
        input.email
      );
      return {
        maxStorageBytes: storageCapForTier(currentTier),
        sizeTier: currentTier,
      };
    }

    const startedAt = new Date();
    await prisma.group.update({
      where: { id: input.groupId },
      data: {
        sizeTier: input.sizeTier,
        pendingSizeTier: null,
        pendingSource: null,
        graceEndsAt: null,
        graceNotifiedAt: null,
        sizeProductId: productIdForTier(input.sizeTier),
        sizeStartedAt: startedAt,
        maxStorageBytes: storageBytesToDb(cap),
      },
    });
    await this.notifyOwnerAndAdmins(
      input.groupId,
      'Group size updated',
      `${group.name} is now a ${GROUP_TIERS[input.sizeTier].label} group (${formatStorageBytes(cap)}).`
    );
    await recordPurchase({
      userId: input.userId,
      kind: 'size_addon',
      title: `${GROUP_TIERS[input.sizeTier].label} group`,
      detail: group.name,
      productId: productIdForTier(input.sizeTier),
      groupId: group.id,
      groupName: group.name,
    });
    await this.emailPlanUpdate({
      ownerId: input.userId,
      email: input.email,
      groupName: group.name,
      currentLabel: GROUP_TIERS[currentTier].label,
      nextLabel: GROUP_TIERS[input.sizeTier].label,
      immediate: true,
      startedAt,
    });
    return { maxStorageBytes: cap, sizeTier: input.sizeTier };
  }

  /** Immediate cancel log when a paid group is deleted (no grace). */
  public async cancelOnGroupDelete(input: {
    groupId: string;
    userId: string;
    name: string;
    sizeTier: string | null | undefined;
  }): Promise<void> {
    const tier = parseSizeTier(input.sizeTier);
    if (!isPaidSizeTier(tier)) return;
    await recordPurchase({
      userId: input.userId,
      kind: 'cancel',
      title: `Cancelled ${GROUP_TIERS[tier].label}`,
      detail: input.name,
      productId: productIdForTier(tier),
      groupId: input.groupId,
      groupName: input.name,
    });
    const now = new Date();
    await this.emailPlanUpdate({
      ownerId: input.userId,
      groupName: input.name,
      currentLabel: GROUP_TIERS[tier].label,
      nextLabel: 'cancelled',
      immediate: true,
      startedAt: now,
      expiresAt: now,
      cancelled: true,
    });
  }

  /**
   * Store entitlements are often missing in Test Store / sandbox and after an in-app
   * apply, so sync must never invent a cancel. Owner-scheduled downgrades stay.
   * Any billing-sourced pending cancel is cleared so a started Medium/Large plan sticks.
   */
  public async syncOwnerEntitlements(
    userId: string,
    _entitlements: BillingEntitlementSnapshot
  ): Promise<void> {
    const owned = await prisma.groupMember.findMany({
      where: {
        userId,
        role: 'owner',
        status: 'active',
        group: { deletedAt: null },
      },
      select: { groupId: true },
    });
    const groups = await prisma.group.findMany({
      where: { id: { in: owned.map((r) => r.groupId) } },
      select: {
        id: true,
        sizeTier: true,
        pendingSizeTier: true,
        pendingSource: true,
      },
    });

    for (const group of groups) {
      const tier = parseSizeTier(group.sizeTier);
      if (!isPaidSizeTier(tier)) continue;
      if (group.pendingSource === 'owner') continue;
      if (group.pendingSizeTier) {
        await this.clearGrace(group.id);
      }
    }
  }

  public async clearGrace(groupId: string): Promise<void> {
    await prisma.group.update({
      where: { id: groupId },
      data: {
        pendingSizeTier: null,
        pendingSource: null,
        graceEndsAt: null,
        graceNotifiedAt: null,
      },
    });
  }

  public async startGrace(
    groupId: string,
    groupName: string,
    ownerId: string,
    pendingSizeTier: GroupSizeTier,
    alreadyNotifiedAt: Date | null | undefined,
    source: 'owner' | 'billing' = 'billing',
    email?: string | null
  ): Promise<void> {
    const existing = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        graceEndsAt: true,
        graceNotifiedAt: true,
        sizeTier: true,
        sizeStartedAt: true,
        pendingSizeTier: true,
        pendingSource: true,
      },
    });
    if (!existing) return;
    if (parseSizeTier(existing.sizeTier) === pendingSizeTier) {
      await this.clearGrace(groupId);
      return;
    }

    const alreadyPending = existing.pendingSizeTier === pendingSizeTier;
    const periodEnd = monthPeriodExpiresAt(existing.sizeStartedAt ?? new Date());
    const graceEndsAt = existing.graceEndsAt ?? periodEnd;
    const pendingSource =
      existing.pendingSource === 'owner' || source === 'owner' ? 'owner' : 'billing';
    await prisma.group.update({
      where: { id: groupId },
      data: { pendingSizeTier, pendingSource, graceEndsAt },
    });
    if (!alreadyPending) {
      const from = GROUP_TIERS[parseSizeTier(existing.sizeTier)].label;
      const to = GROUP_TIERS[pendingSizeTier].label;
      await recordPurchase({
        userId: ownerId,
        kind: 'cancel',
        title: `Switched to ${to}`,
        detail: `${groupName} · was ${from}`,
        groupId,
        groupName,
      });
      await this.emailPlanUpdate({
        ownerId,
        email,
        groupName,
        currentLabel: from,
        nextLabel: to,
        immediate: false,
        startedAt: existing.sizeStartedAt ?? new Date(),
        expiresAt: graceEndsAt,
      });
    }

    if (alreadyNotifiedAt ?? existing.graceNotifiedAt) return;
    await prisma.group.update({
      where: { id: groupId },
      data: { graceNotifiedAt: new Date() },
    });

    const ends = graceEndsAt.toLocaleDateString();
    const cap = storageCapForTier(pendingSizeTier);
    const body =
      `${groupName} is scheduled to become a ${GROUP_TIERS[pendingSizeTier].label} group on ${ends}. ` +
      `Until then, storage stays as-is so you can fix billing or download files. ` +
      `After that, older files will be deleted until usage is under ${formatStorageBytes(cap)}.`;

    await this.notifyOwnerAndAdmins(groupId, 'Group size grace period', body, {
      icon: 'warning-outline',
    });
  }

  public async applyDueGracePeriods(): Promise<void> {
    const due = await prisma.group.findMany({
      where: {
        deletedAt: null,
        pendingSizeTier: { not: null },
        graceEndsAt: { lte: new Date() },
      },
      select: { id: true, name: true, pendingSizeTier: true },
    });
    for (const group of due) {
      const pending = parseSizeTier(group.pendingSizeTier);
      await this.finishGrace(group.id, pending);
    }
  }

  public async finishGrace(groupId: string, pending: GroupSizeTier): Promise<void> {
    const cap = storageCapForTier(pending);
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true, sizeTier: true },
    });
    const owner = await prisma.groupMember.findFirst({
      where: { groupId, role: 'owner', status: 'active' },
      select: { userId: true },
    });
    await groupStorage.purgeOldestUntilUnderCap(groupId, cap);
    const startedAt = isPaidSizeTier(pending) ? new Date() : null;
    await prisma.group.update({
      where: { id: groupId },
      data: {
        sizeTier: pending,
        pendingSizeTier: null,
        pendingSource: null,
        graceEndsAt: null,
        graceNotifiedAt: null,
        sizeProductId: isPaidSizeTier(pending) ? productIdForTier(pending as PaidSizeTier) : null,
        sizeStartedAt: startedAt,
        maxStorageBytes: storageBytesToDb(cap),
      },
    });
    if (group) {
      await this.notifyOwnerAndAdmins(
        groupId,
        'Group size updated',
        `${group.name} is now a ${GROUP_TIERS[pending].label} group (${formatStorageBytes(cap)}).`
      );
      if (owner) {
        await this.emailPlanUpdate({
          ownerId: owner.userId,
          groupName: group.name,
          currentLabel: GROUP_TIERS[parseSizeTier(group.sizeTier)].label,
          nextLabel: GROUP_TIERS[pending].label,
          immediate: true,
          startedAt: startedAt ?? new Date(),
          cancelled: pending === 'small',
        });
      }
    }
  }

  private async resolveOwnerEmail(ownerId: string, fallback?: string | null): Promise<string | null> {
    const candidate = fallback?.trim();
    const validFallback = candidate && candidate.includes('@') ? candidate : null;
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true },
    });
    if (validFallback && owner?.email !== validFallback) {
      await prisma.user
        .update({
          where: { id: ownerId },
          data: { email: validFallback },
        })
        .catch(() => undefined);
    }
    return validFallback ?? owner?.email ?? null;
  }

  private async emailPlanUpdate(input: {
    ownerId: string;
    email?: string | null;
    groupName: string;
    currentLabel: string;
    nextLabel: string;
    immediate: boolean;
    startedAt: Date;
    expiresAt?: Date | null;
    cancelled?: boolean;
  }): Promise<void> {
    const to = await this.resolveOwnerEmail(input.ownerId, input.email);
    const expires = input.expiresAt ?? monthPeriodExpiresAt(input.startedAt);
    const renews = nextMonthlyAnniversary(input.startedAt);
    const freeOrCancelled =
      input.cancelled || input.nextLabel === 'Small' || input.nextLabel === 'cancelled';
    const shownLabel = input.immediate || input.cancelled ? input.nextLabel : input.currentLabel;
    const current = planReceipt(input.currentLabel);
    const next = planReceipt(input.nextLabel);
    const shown = input.cancelled ? { ...current, price: '$0.00/mo' } : planReceipt(shownLabel);
    const intro = input.cancelled
      ? `Your ${current.name} plan for “${input.groupName}” has been cancelled.`
      : input.immediate
        ? `Thanks for updating your moijia subscription. “${input.groupName}” is now on ${next.name}.`
        : `Your moijia subscription for “${input.groupName}” will change from ${current.name} to ${next.name} on ${formatMailDate(expires)}.`;
    const nextBilling = freeOrCancelled ? 'None' : formatMailDate(renews);
    const paymentMethod = freeOrCancelled ? 'None' : 'App Store';
    const subscriptionRows = [
      { label: 'Group', value: input.groupName },
      { label: 'Plan', value: shown.name },
      { label: 'Storage', value: shown.storage },
      { label: 'Price', value: shown.price },
    ];
    if (!input.immediate && !input.cancelled) {
      subscriptionRows.splice(2, 0, { label: 'Changes to', value: `${next.name} on ${formatMailDate(expires)}` });
    }
    const sections: ReceiptSection[] = [
      { heading: 'YOUR SUBSCRIPTION', rows: subscriptionRows },
      {
        heading: 'PAYMENT INFORMATION',
        rows: [
          { label: 'Payment Method', value: paymentMethod },
          { label: 'Your Charge(s)', value: shown.price },
          { label: 'Next billing date', value: nextBilling },
          { label: 'Expiration date', value: formatMailDate(expires) },
        ],
      },
    ];
    const text = [
      intro,
      '',
      ...sections.flatMap((section) => [
        section.heading,
        ...section.rows.map((row) => `${row.label}: ${row.value}`),
        '',
      ]),
      MAIL_FOOTER.join('\n\n'),
    ].join('\n');
    const subject = input.cancelled
      ? `Your moijia subscription for “${input.groupName}” was cancelled`
      : 'Your moijia subscription confirmation';
    await sendOwnerEmail({
      to,
      subject,
      text,
      intro,
      sections,
    }).catch((err) => {
      console.warn('[mail] plan update failed', err);
    });
  }

  private async notifyOwnerAndAdmins(
    groupId: string,
    title: string,
    body: string,
    options?: { icon?: string }
  ): Promise<void> {
    const members = await prisma.groupMember.findMany({
      where: {
        groupId,
        status: 'active',
        role: { in: ['owner', 'admin'] },
      },
      select: { userId: true },
    });
    const ids = [...new Set(members.map((m) => m.userId))];
    if (ids.length === 0) return;
    await notificationService
      .createForUsers(ids, title, body, {
        type: 'group_storage',
        icon: options?.icon ?? 'cloud-circle-outline',
        groupId,
        dest: 'group',
      })
      .catch(() => undefined);
  }
}

export const groupBilling = new GroupBillingService();
