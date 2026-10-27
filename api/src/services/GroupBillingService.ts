import { PrismaClient } from '@prisma/client';
import { groupStorage } from './GroupStorageService';
import { NotificationService } from './NotificationService';
import { MAIL_FOOTER, sendOwnerEmail, type ReceiptSection } from './EmailService';
import { httpError } from '../utils/httpError';
import { recordPurchase } from './PurchaseHistoryService';
import type { OwnedGroupQuota } from '../models/Group';
import {
  GROUP_DOWNGRADE_GRACE_MS,
  GROUP_TIERS,
  formatStorageBytes,
  parseSizeTier,
  sizeTierRank,
  storageBytesToDb,
  storageCapForTier,
  type GroupSizeTier,
} from '../utils/groupStorageLimits';
import {
  PRO_MONTHLY_PRICE_LABEL,
  PRO_PRODUCT_ID,
  ownedGroupCapacity,
  parseSubscriptionTier,
  planLabel,
  sizeForNewGroup,
  subscriptionRank,
  tierAllowsSize,
  type SubscriptionTier,
} from '../utils/subscriptionTiers';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export interface ProSubscriptionSnapshot {
  proActive: boolean;
  proRenewing: boolean;
  expiresAt: Date | null;
}

function formatMailDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export class GroupBillingService {
  public sizeForNewGroup(tier: SubscriptionTier, requested: unknown): GroupSizeTier {
    return sizeForNewGroup(tier, requested);
  }

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

  public async getOwnedGroupQuota(userId: string): Promise<OwnedGroupQuota> {
    const [ownedGroupCount, user] = await Promise.all([
      this.ownedGroupCount(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          subscriptionTier: true,
          subscriptionExpiresAt: true,
          downgradeAt: true,
        },
      }),
    ]);
    const subscriptionTier = parseSubscriptionTier(user?.subscriptionTier);
    const groupCapacity = ownedGroupCapacity(subscriptionTier);
    return {
      ownedGroupCount,
      subscriptionTier,
      groupCapacity,
      canCreateGroup: groupCapacity == null || ownedGroupCount < groupCapacity,
      subscriptionExpiresAt: user?.subscriptionExpiresAt ?? null,
      downgradeAt: user?.downgradeAt ?? null,
    };
  }

  public async assertCanCreateOwnedGroup(userId: string): Promise<OwnedGroupQuota> {
    const quota = await this.getOwnedGroupQuota(userId);
    if (quota.canCreateGroup) return quota;
    const cap = quota.groupCapacity ?? 0;
    const message =
      quota.subscriptionTier === 'pro'
        ? `Pro includes up to ${cap} groups. Contact us about Enterprise for more.`
        : `Free includes up to ${cap} groups. Upgrade to Pro for up to 10.`;
    throw httpError(403, message, { code: 'owned_group_limit' });
  }

  public async assertCanReceiveGroup(input: {
    fromUserId: string;
    toUserId: string;
    groupSize: GroupSizeTier;
  }): Promise<void> {
    const [from, to, owned] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.fromUserId },
        select: { subscriptionTier: true },
      }),
      prisma.user.findUnique({
        where: { id: input.toUserId },
        select: { subscriptionTier: true },
      }),
      this.ownedGroupCount(input.toUserId),
    ]);
    if (!to) throw httpError(404, 'Member not found');
    const fromTier = parseSubscriptionTier(from?.subscriptionTier);
    const toTier = parseSubscriptionTier(to.subscriptionTier);
    if (subscriptionRank(toTier) < subscriptionRank(fromTier)) {
      throw httpError(
        403,
        'Transfer ownership to an admin on an equal or higher plan.'
      );
    }
    if (!tierAllowsSize(toTier, input.groupSize)) {
      throw httpError(
        403,
        `This admin's ${planLabel(toTier)} plan cannot own a ${GROUP_TIERS[input.groupSize].label} group.`
      );
    }
    const cap = ownedGroupCapacity(toTier);
    if (cap != null && owned >= cap) {
      throw httpError(403, 'That admin is already at their group limit.');
    }
  }

  /**
   * Store Pro onto the user. Enterprise is assigned outside the app and is left alone.
   * A new Pro subscription raises owned groups to Medium. After Pro expires, non-small
   * groups stay put for 15 days, then become Small.
   */
  public async syncSubscription(userId: string, input: ProSubscriptionSnapshot): Promise<OwnedGroupQuota> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        subscriptionProductId: true,
      },
    });
    if (!user) throw httpError(404, 'User not found');

    const tier = parseSubscriptionTier(user.subscriptionTier);
    if (tier === 'enterprise') return this.getOwnedGroupQuota(userId);

    const now = Date.now();
    const expiresMs = input.expiresAt?.getTime();
    const expiresValid = expiresMs != null && !Number.isNaN(expiresMs);
    const inPaidPeriod = input.proActive && (!expiresValid || expiresMs > now);

    if (inPaidPeriod) {
      const becomingPro = tier !== 'pro';
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: 'pro',
          subscriptionExpiresAt: input.expiresAt,
          subscriptionProductId: PRO_PRODUCT_ID,
          subscriptionWillRenew: input.proRenewing,
          downgradeAt: null,
        },
      });
      await this.clearOwnedGrace(userId);
      if (becomingPro) {
        await this.upgradeOwnedGroupsToMedium(userId);
        await recordPurchase({
          userId,
          kind: 'subscription',
          title: 'Pro',
          detail: PRO_MONTHLY_PRICE_LABEL,
          productId: PRO_PRODUCT_ID,
        });
        await this.emailSubscription({
          ownerId: userId,
          intro: 'Thanks for subscribing to moijia Pro. Groups you own are Medium (10 GB), and you can create up to 10.',
          plan: 'Pro',
          price: PRO_MONTHLY_PRICE_LABEL,
          expiresAt: input.expiresAt,
          renewing: input.proRenewing,
        });
      }
      await this.applyDueGracePeriods();
      return this.getOwnedGroupQuota(userId);
    }

    const wasPro = tier === 'pro' || user.subscriptionProductId === PRO_PRODUCT_ID;
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: 'free',
        subscriptionWillRenew: false,
        subscriptionExpiresAt: input.expiresAt ?? user.subscriptionExpiresAt,
        subscriptionProductId: wasPro ? PRO_PRODUCT_ID : null,
      },
    });

    if (wasPro && tier === 'pro') {
      const periodEnd =
        (expiresValid ? input.expiresAt : null) ?? user.subscriptionExpiresAt ?? new Date();
      const downgradeAt = new Date(periodEnd.getTime() + GROUP_DOWNGRADE_GRACE_MS);
      await this.scheduleDowngrade(userId, downgradeAt);
      await recordPurchase({
        userId,
        kind: 'cancel',
        title: 'Pro ended',
        detail: `Groups stay at their current size until ${formatMailDate(downgradeAt)}`,
        productId: PRO_PRODUCT_ID,
      });
    }

    await this.applyDueGracePeriods();
    return this.getOwnedGroupQuota(userId);
  }

  public async upgradeOwnedGroupsToMedium(userId: string): Promise<void> {
    const owned = await this.ownedGroups(userId);
    let raised = 0;
    for (const group of owned) {
      const size = parseSizeTier(group.sizeTier);
      if (sizeTierRank(size) >= sizeTierRank('medium')) continue;
      const cap = storageCapForTier('medium');
      await prisma.group.update({
        where: { id: group.id },
        data: {
          sizeTier: 'medium',
          maxStorageBytes: storageBytesToDb(cap),
          pendingSizeTier: null,
          pendingSource: null,
          graceEndsAt: null,
          graceNotifiedAt: null,
          sizeProductId: null,
          sizeStartedAt: null,
        },
      });
      raised += 1;
    }
    if (raised === 0) return;
    await notificationService
      .createForUsers(
        [userId],
        'Groups updated',
        'Pro raised the groups you own to Medium (10 GB).',
        { type: 'group_storage', icon: 'cloud-circle-outline' }
      )
      .catch(() => undefined);
  }

  /** Enterprise owners pick small, medium, or large. The change applies immediately. */
  public async setOwnedGroupSize(input: {
    groupId: string;
    userId: string;
    sizeTier: GroupSizeTier;
  }): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { subscriptionTier: true },
    });
    if (parseSubscriptionTier(user?.subscriptionTier) !== 'enterprise') {
      throw httpError(403, 'Only an Enterprise plan can choose a group size.');
    }
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: { id: true, name: true, deletedAt: true, sizeTier: true },
    });
    if (!group || group.deletedAt) throw httpError(404, 'Group not found');
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      select: { role: true, status: true },
    });
    if (!member || member.status !== 'active' || member.role !== 'owner') {
      throw httpError(403, 'Must be the group owner to change the group size');
    }
    const next = parseSizeTier(input.sizeTier);
    const current = parseSizeTier(group.sizeTier);
    if (next === current) {
      await this.clearGrace(input.groupId);
      return;
    }
    const cap = storageCapForTier(next);
    if (sizeTierRank(next) < sizeTierRank(current)) {
      await groupStorage.purgeOldestUntilUnderCap(input.groupId, cap);
    }
    await prisma.group.update({
      where: { id: input.groupId },
      data: {
        sizeTier: next,
        maxStorageBytes: storageBytesToDb(cap),
        pendingSizeTier: null,
        pendingSource: null,
        graceEndsAt: null,
        graceNotifiedAt: null,
        sizeProductId: null,
        sizeStartedAt: null,
      },
    });
  }

  /** Free accounts that still own a Medium or Large group get the 15-day backup window. */
  public async scheduleOutstandingFreeDowngrades(): Promise<void> {
    const groups = await prisma.group.findMany({
      where: {
        deletedAt: null,
        sizeTier: { not: 'small' },
        pendingSizeTier: null,
        members: {
          some: {
            role: 'owner',
            status: 'active',
            user: { subscriptionTier: 'free', downgradeAt: null },
          },
        },
      },
      select: {
        members: {
          where: { role: 'owner', status: 'active' },
          select: { userId: true },
        },
      },
    });
    const downgradeAt = new Date(Date.now() + GROUP_DOWNGRADE_GRACE_MS);
    const ownerIds = new Set(groups.flatMap((group) => group.members.map((member) => member.userId)));
    for (const userId of ownerIds) {
      await this.scheduleDowngrade(userId, downgradeAt);
    }
  }

  public async scheduleDowngrade(userId: string, downgradeAt: Date): Promise<void> {
    const owned = await this.ownedGroups(userId);
    const shrinking = owned.filter((group) => parseSizeTier(group.sizeTier) !== 'small');
    if (shrinking.length === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { downgradeAt: null },
      });
      return;
    }
    await prisma.user.update({
      where: { id: userId },
      data: { downgradeAt },
    });
    for (const group of shrinking) {
      await this.startGrace(group.id, 'small', downgradeAt);
    }
    const when = formatMailDate(downgradeAt);
    const body =
      `Pro has ended. Groups you own stay at their current size until ${when} so you can download files. After that they become Small (1 GB).`;
    await notificationService
      .createForUsers([userId], 'Plan grace period', body, {
        type: 'group_storage',
        icon: 'warning-outline',
      })
      .catch(() => undefined);
    await this.emailSubscription({
      ownerId: userId,
      intro: body,
      plan: 'Free',
      price: '$0.00/mo',
      expiresAt: downgradeAt,
      renewing: false,
      subject: 'Your moijia Pro plan has ended',
    });
  }

  public async clearOwnedGrace(userId: string): Promise<void> {
    const owned = await this.ownedGroups(userId);
    await Promise.all(owned.map((group) => this.clearGrace(group.id)));
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

  public async startGrace(groupId: string, pendingSizeTier: GroupSizeTier, graceEndsAt: Date): Promise<void> {
    const existing = await prisma.group.findUnique({
      where: { id: groupId },
      select: { sizeTier: true, pendingSizeTier: true, graceEndsAt: true },
    });
    if (!existing) return;
    if (parseSizeTier(existing.sizeTier) === pendingSizeTier) {
      await this.clearGrace(groupId);
      return;
    }
    await prisma.group.update({
      where: { id: groupId },
      data: {
        pendingSizeTier,
        pendingSource: 'billing',
        graceEndsAt: existing.graceEndsAt ?? graceEndsAt,
        graceNotifiedAt: existing.pendingSizeTier ? undefined : new Date(),
      },
    });
  }

  public async applyDueGracePeriods(): Promise<void> {
    const due = await prisma.group.findMany({
      where: {
        deletedAt: null,
        pendingSizeTier: { not: null },
        graceEndsAt: { lte: new Date() },
      },
      select: { id: true, pendingSizeTier: true },
    });
    const owners = new Set<string>();
    for (const group of due) {
      const ownerId = await this.finishGrace(group.id, parseSizeTier(group.pendingSizeTier));
      if (ownerId) owners.add(ownerId);
    }
    if (owners.size > 0) {
      await prisma.user.updateMany({
        where: { id: { in: [...owners] } },
        data: { downgradeAt: null },
      });
    }
    await prisma.user.updateMany({
      where: { downgradeAt: { lte: new Date() } },
      data: { downgradeAt: null },
    });
  }

  public async finishGrace(groupId: string, pending: GroupSizeTier): Promise<string | null> {
    const cap = storageCapForTier(pending);
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    });
    const owner = await prisma.groupMember.findFirst({
      where: { groupId, role: 'owner', status: 'active' },
      select: { userId: true },
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
        sizeProductId: null,
        sizeStartedAt: null,
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
    return owner?.userId ?? null;
  }

  private async ownedGroups(userId: string): Promise<Array<{ id: string; name: string; sizeTier: string }>> {
    const rows = await prisma.groupMember.findMany({
      where: {
        userId,
        role: 'owner',
        status: 'active',
        group: { deletedAt: null },
      },
      select: { group: { select: { id: true, name: true, sizeTier: true } } },
    });
    return rows.map((row) => row.group);
  }

  private async emailSubscription(input: {
    ownerId: string;
    intro: string;
    plan: string;
    price: string;
    expiresAt: Date | null;
    renewing: boolean;
    subject?: string;
  }): Promise<void> {
    const owner = await prisma.user.findUnique({
      where: { id: input.ownerId },
      select: { email: true },
    });
    const to = owner?.email?.includes('@') ? owner.email : null;
    const sections: ReceiptSection[] = [
      {
        heading: 'YOUR SUBSCRIPTION',
        rows: [
          { label: 'Plan', value: input.plan },
          { label: 'Price', value: input.price },
          {
            label: input.renewing ? 'Renews' : 'Access through',
            value: input.expiresAt ? formatMailDate(input.expiresAt) : 'None',
          },
        ],
      },
    ];
    const text = [
      input.intro,
      '',
      ...sections.flatMap((section) => [
        section.heading,
        ...section.rows.map((row) => `${row.label}: ${row.value}`),
        '',
      ]),
      MAIL_FOOTER.join('\n\n'),
    ].join('\n');
    await sendOwnerEmail({
      to,
      subject: input.subject ?? 'Your moijia subscription confirmation',
      text,
      intro: input.intro,
      sections,
    }).catch((err) => {
      console.warn('[mail] subscription update failed', err);
    });
  }

  private async notifyOwnerAndAdmins(groupId: string, title: string, body: string): Promise<void> {
    const members = await prisma.groupMember.findMany({
      where: {
        groupId,
        status: 'active',
        role: { in: ['owner', 'admin'] },
      },
      select: { userId: true },
    });
    const ids = [...new Set(members.map((member) => member.userId))];
    if (ids.length === 0) return;
    await notificationService
      .createForUsers(ids, title, body, {
        type: 'group_storage',
        icon: 'cloud-circle-outline',
        groupId,
        dest: 'group',
      })
      .catch(() => undefined);
  }
}

export const groupBilling = new GroupBillingService();
