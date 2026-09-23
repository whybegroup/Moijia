import { PrismaClient } from '@prisma/client';
import { groupStorage } from './GroupStorageService';
import { NotificationService } from './NotificationService';
import { sendOwnerEmail } from './EmailService';
import { httpError } from '../utils/httpError';
import { monthPeriodExpiresAt } from '../utils/groupPlanPeriod';
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
  }): Promise<{ maxStorageBytes: number; sizeTier: GroupSizeTier }> {
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: { id: true, name: true, deletedAt: true, sizeTier: true, sizeStartedAt: true },
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
      await this.clearGrace(input.groupId);
      return { maxStorageBytes: cap, sizeTier: currentTier };
    }
    const isDowngrade = sizeTierRank(input.sizeTier) < sizeTierRank(currentTier);

    if (isDowngrade) {
      await this.startGrace(group.id, group.name, input.userId, input.sizeTier, null, 'owner');
      return {
        maxStorageBytes: storageCapForTier(currentTier),
        sizeTier: currentTier,
      };
    }

    await prisma.group.update({
      where: { id: input.groupId },
      data: {
        sizeTier: input.sizeTier,
        pendingSizeTier: null,
        pendingSource: null,
        graceEndsAt: null,
        graceNotifiedAt: null,
        sizeProductId: productIdForTier(input.sizeTier),
        sizeStartedAt: currentTier === 'small' || !group.sizeStartedAt ? new Date() : group.sizeStartedAt,
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
    return { maxStorageBytes: cap, sizeTier: input.sizeTier };
  }

  /**
   * Store Medium/Large add-ons are shared across owned groups of that tier.
   * Owner-scheduled downgrades stay pending even while the entitlement is still active.
   * Only a lapsed store entitlement starts billing grace, and only on groups the owner
   * did not already schedule.
   */
  public async syncOwnerEntitlements(
    userId: string,
    entitlements: BillingEntitlementSnapshot
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
        name: true,
        sizeTier: true,
        pendingSizeTier: true,
        pendingSource: true,
        graceEndsAt: true,
        graceNotifiedAt: true,
      },
    });

    for (const group of groups) {
      const tier = parseSizeTier(group.sizeTier);
      if (!isPaidSizeTier(tier)) continue;
      if (group.pendingSource === 'owner') continue;

      const covered = tier === 'large' ? entitlements.largeActive : entitlements.mediumActive;
      if (covered) {
        await this.clearGrace(group.id);
        continue;
      }

      const fallback: GroupSizeTier =
        tier === 'large' && entitlements.mediumActive ? 'medium' : 'small';
      await this.startGrace(group.id, group.name, userId, fallback, group.graceNotifiedAt, 'billing');
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
    source: 'owner' | 'billing' = 'billing'
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

    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true },
    });
    await sendOwnerEmail({
      to: owner?.email,
      subject: `Your moijia group “${groupName}” size changes on ${ends}`,
      text: body,
    }).catch(() => undefined);
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
      select: { name: true },
    });
    await groupStorage.purgeOldestUntilUnderCap(groupId, cap);
    await prisma.group.update({
      where: { id: groupId },
      data: {
        sizeTier: pending,
        pendingSizeTier: null,
        pendingSource: null,
        graceEndsAt: null,
        graceNotifiedAt: null,
        sizeProductId: isPaidSizeTier(pending) ? productIdForTier(pending as PaidSizeTier) : null,
        ...(isPaidSizeTier(pending) ? {} : { sizeStartedAt: null }),
        maxStorageBytes: storageBytesToDb(cap),
      },
    });
    if (group) {
      await this.notifyOwnerAndAdmins(
        groupId,
        'Group size updated',
        `${group.name} is now a ${GROUP_TIERS[pending].label} group (${formatStorageBytes(cap)}).`
      );
    }
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
