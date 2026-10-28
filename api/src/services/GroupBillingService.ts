import { PrismaClient } from '@prisma/client';
import { groupStorage } from './GroupStorageService';
import { NotificationService } from './NotificationService';
import { MAIL_FOOTER, sendOwnerEmail, type ReceiptSection } from './EmailService';
import { httpError } from '../utils/httpError';
import { parseGroupOrderJson, partitionByOrder } from '../utils/groupOrder';
import { purgeGroupCompletely } from './groupPurge';
import { recordPurchase } from './PurchaseHistoryService';
import type { OwnedGroupQuota, SubscriptionCancelCheck } from '../models/Group';
import {
  FREE_OWNED_GROUP_LIMIT,
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
  downgradeGraceMs,
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
  /** Start of the current provider period. */
  purchasedAt: Date | null;
}

function validDate(value: Date | null | undefined): Date | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value;
}

function formatMailDate(date: Date): string {
  const soon = Math.abs(date.getTime() - Date.now()) < 48 * 60 * 60 * 1000;
  if (soon) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type OwnedGroupRow = { id: string; name: string; sizeTier: string; deletedAt: Date | null };

export type GroupUploadLimit =
  | { kind: 'default' }
  | { kind: 'closed'; message: string }
  | { kind: 'capped'; maxBytes: number; message: string };

function downgradeNotice(
  when: string,
  keep: OwnedGroupRow[],
  deleting: OwnedGroupRow[],
  hasAlreadyDeleted: boolean,
  planName = 'Pro'
): string {
  const ended = `${planName} has ended.`;
  if (deleting.length === 0 && !hasAlreadyDeleted) {
    return `${ended} Until ${when} you can download, delete files, or transfer a group. New uploads stop once a group is over 1 GB. On ${when} the groups you keep become Small (1 GB), and older files over that limit are removed.`;
  }
  if (deleting.length === 0) {
    const kept = keep.map((group) => group.name).join(', ');
    const size = kept
      ? `The groups you keep (${kept}) become Small (1 GB), and older files over that limit are removed. `
      : '';
    return `${ended} On ${when}, groups you already deleted are permanently removed and cannot be restored. ${size}`.trim();
  }
  const kept = keep.map((group) => group.name).join(', ') || 'none';
  const removed = deleting.map((group) => group.name).join(', ');
  const lines = [
    `${ended} On ${when}, only the top two groups in My Groups are kept (${kept}).`,
  ];
  if (removed) {
    lines.push(`These groups will be permanently deleted: ${removed}.`);
  }
  lines.push(
    `On the Groups tab, move groups between Kept and Will be deleted before then. Until ${when} you can download, delete files, or transfer a group. New uploads stop once a kept group is over 1 GB. On ${when} those groups become Small (1 GB), and older files over that limit are removed.`
  );
  if (hasAlreadyDeleted) {
    lines.push('Groups you already deleted are permanently removed on that date and cannot be restored.');
  }
  return lines.join(' ');
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

  /** Reports whether owned groups already fit the free plan. Cancelling is still allowed. */
  public async getSubscriptionCancelCheck(userId: string): Promise<SubscriptionCancelCheck> {
    const owned = await this.ownedGroups(userId);
    const cap = storageCapForTier('small');
    const overStorage: SubscriptionCancelCheck['overStorage'] = [];
    for (const group of owned) {
      const usedBytes = await groupStorage.getUsedStorageBytes(group.id);
      if (usedBytes > cap) {
        overStorage.push({ id: group.id, name: group.name, usedBytes });
      }
    }
    overStorage.sort((a, b) => b.usedBytes - a.usedBytes);
    return {
      allowed: owned.length <= FREE_OWNED_GROUP_LIMIT && overStorage.length === 0,
      ownedCount: owned.length,
      overStorage,
    };
  }

  public async getOwnedGroupQuota(userId: string): Promise<OwnedGroupQuota> {
    const [ownedGroupCount, user] = await Promise.all([
      this.ownedGroupCount(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          subscriptionTier: true,
          subscriptionExpiresAt: true,
          subscriptionStartedAt: true,
          subscriptionWillRenew: true,
          downgradeAt: true,
          subscriptionWarning: true,
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
      subscriptionStartedAt: user?.subscriptionStartedAt ?? null,
      subscriptionWillRenew: user?.subscriptionWillRenew ?? false,
      downgradeAt: user?.downgradeAt ?? null,
      subscriptionWarning: user?.subscriptionWarning?.trim() || null,
    };
  }

  public async assertCanCreateOwnedGroup(userId: string): Promise<OwnedGroupQuota> {
    const quota = await this.getOwnedGroupQuota(userId);
    if (quota.canCreateGroup) return quota;
    const cap = quota.groupCapacity ?? 0;
    const message =
      quota.subscriptionTier === 'pro'
        ? `Pro includes up to ${cap} groups. Contact sales@moijia.com about Enterprise for more.`
        : `Free includes up to ${cap} groups. Upgrade to Pro in Profile > Subscription to create up to 10 groups.`;
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
   * Dates come from the provider. After that period ends, groups stay for half of it.
   * Then the top two in My Groups are kept and become Small, and the rest are permanently deleted.
   */
  public async syncSubscription(userId: string, input: ProSubscriptionSnapshot): Promise<OwnedGroupQuota> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        subscriptionStartedAt: true,
        subscriptionExpiresAt: true,
        subscriptionProductId: true,
      },
    });
    if (!user) throw httpError(404, 'User not found');

    const tier = parseSubscriptionTier(user.subscriptionTier);
    if (tier === 'enterprise') return this.getOwnedGroupQuota(userId);

    const purchasedAt = validDate(input.purchasedAt);
    const storeExpires = validDate(input.expiresAt);
    const storedStart = validDate(user.subscriptionStartedAt);
    const storedExpires = validDate(user.subscriptionExpiresAt);
    const startedAt = purchasedAt ?? storedStart;
    const expiresAt = storeExpires ?? storedExpires;
    const inPaidPeriod = input.proActive;

    if (inPaidPeriod) {
      const becomingPro = tier !== 'pro';
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: 'pro',
          subscriptionStartedAt: startedAt,
          subscriptionExpiresAt: expiresAt,
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
          expiresAt,
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
        subscriptionStartedAt: startedAt,
        subscriptionExpiresAt: expiresAt ?? user.subscriptionExpiresAt,
        subscriptionProductId: wasPro ? PRO_PRODUCT_ID : null,
      },
    });

    if (wasPro && tier === 'pro') {
      const periodEnd = expiresAt ?? storedExpires ?? new Date();
      const downgradeAt = new Date(periodEnd.getTime() + downgradeGraceMs(startedAt, periodEnd));
      const downgrading = await this.scheduleDowngrade(userId, downgradeAt);
      await recordPurchase({
        userId,
        kind: 'cancel',
        title: 'Pro ended',
        detail: downgrading
          ? `Free plan limits apply on ${formatMailDate(downgradeAt)}`
          : 'Switched to Free',
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

  /** Enterprise plans with a developer-set end date become Free, then keep groups for half of that span. */
  public async expireEnterprisePlans(): Promise<void> {
    const due = await prisma.user.findMany({
      where: {
        subscriptionTier: 'enterprise',
        subscriptionExpiresAt: { lte: new Date() },
      },
      select: { id: true, subscriptionStartedAt: true, subscriptionExpiresAt: true },
    });
    for (const user of due) {
      const periodEnd = user.subscriptionExpiresAt ?? new Date();
      const downgradeAt = new Date(
        periodEnd.getTime() + downgradeGraceMs(user.subscriptionStartedAt, periodEnd)
      );
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: 'free',
          subscriptionWillRenew: false,
          subscriptionProductId: null,
          subscriptionStartedAt: null,
        },
      });
      const scheduled = await this.scheduleDowngrade(user.id, downgradeAt, 'Enterprise');
      await recordPurchase({
        userId: user.id,
        kind: 'cancel',
        title: 'Enterprise ended',
        detail: scheduled
          ? `Free plan limits apply on ${formatMailDate(downgradeAt)}`
          : 'Switched to Free',
        productId: null,
      });
    }
  }

  /** Free accounts over the free limits get half of their last period before groups are trimmed or deleted. */
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
    const ownerIds = new Set(groups.flatMap((group) => group.members.map((member) => member.userId)));
    const memberships = await prisma.groupMember.findMany({
      where: {
        role: 'owner',
        status: 'active',
        group: { deletedAt: null },
        user: { subscriptionTier: 'free', downgradeAt: null },
      },
      select: { userId: true },
    });
    const ownedCounts = new Map<string, number>();
    for (const row of memberships) {
      ownedCounts.set(row.userId, (ownedCounts.get(row.userId) ?? 0) + 1);
    }
    for (const [userId, count] of ownedCounts) {
      if (count > FREE_OWNED_GROUP_LIMIT) ownerIds.add(userId);
    }
    if (ownerIds.size === 0) return;
    const users = await prisma.user.findMany({
      where: { id: { in: [...ownerIds] } },
      select: { id: true, subscriptionStartedAt: true, subscriptionExpiresAt: true },
    });
    for (const user of users) {
      const graceMs = downgradeGraceMs(user.subscriptionStartedAt, user.subscriptionExpiresAt);
      await this.scheduleDowngrade(user.id, new Date(Date.now() + graceMs));
    }
  }

  public async scheduleDowngrade(userId: string, downgradeAt: Date, planName = 'Pro'): Promise<boolean> {
    const { keep, remove, active } = await this.classifyOwnedGroups(userId);
    const shrinking = active.filter((group) => parseSizeTier(group.sizeTier) !== 'small');
    const deleting = remove.filter((group) => !group.deletedAt);
    if (shrinking.length === 0 && remove.length === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { downgradeAt: null },
      });
      return false;
    }
    await prisma.user.update({
      where: { id: userId },
      data: { downgradeAt },
    });
    for (const group of shrinking) {
      await this.startGrace(group.id, 'small', downgradeAt);
    }
    const when = formatMailDate(downgradeAt);
    const body = downgradeNotice(when, keep, deleting, remove.some((group) => group.deletedAt), planName);
    await notificationService
      .createForUsers([userId], 'Plan grace period', body, {
        type: 'group_storage',
        icon: 'warning-outline',
      })
      .catch(() => undefined);
    for (const group of keep) {
      if (parseSizeTier(group.sizeTier) === 'small') continue;
      const members = await prisma.groupMember.findMany({
        where: { groupId: group.id, status: 'active', userId: { not: userId } },
        select: { userId: true },
      });
      const ids = members.map((member) => member.userId);
      if (ids.length === 0) continue;
      await notificationService
        .createForUsers(
          ids,
          'Group storage will shrink',
          `${group.name} becomes Small (1 GB) on ${when}. New uploads stop once it is over 1 GB. Older files over that limit are removed on ${when}. Download anything you need before then.`,
          { type: 'group_storage', icon: 'warning-outline', groupId: group.id, dest: 'group' }
        )
        .catch(() => undefined);
    }
    for (const group of deleting) {
      const members = await prisma.groupMember.findMany({
        where: { groupId: group.id, status: 'active', userId: { not: userId } },
        select: { userId: true },
      });
      const ids = members.map((member) => member.userId);
      if (ids.length === 0) continue;
      await notificationService
        .createForUsers(
          ids,
          'Group will be deleted',
          `${group.name} will be permanently deleted on ${when} unless its owner moves it into Kept before then.`,
          { type: 'group_storage', icon: 'warning-outline', groupId: group.id, dest: 'group' }
        )
        .catch(() => undefined);
    }
    await this.emailSubscription({
      ownerId: userId,
      intro: body,
      plan: 'Free',
      price: '$0.00/mo',
      expiresAt: downgradeAt,
      renewing: false,
      subject: `Your moijia ${planName} plan has ended`,
    });
    return true;
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
    const now = new Date();
    const dueUsers = await prisma.user.findMany({
      where: { downgradeAt: { lte: now } },
      select: { id: true },
    });
    for (const user of dueUsers) {
      try {
        await this.finishUserDowngrade(user.id);
      } catch (err) {
        console.error('[group-billing] downgrade failed', user.id, err);
      }
    }

    const due = await prisma.group.findMany({
      where: {
        deletedAt: null,
        pendingSizeTier: { not: null },
        graceEndsAt: { lte: new Date() },
      },
      select: { id: true, pendingSizeTier: true },
    });
    for (const group of due) {
      await this.finishGrace(group.id, parseSizeTier(group.pendingSizeTier));
    }
  }

  /**
   * While a downgrade is scheduled, kept groups cannot grow past 1 GB.
   * Groups that will be deleted accept no new uploads.
   */
  public async uploadLimitForGroup(groupId: string): Promise<GroupUploadLimit> {
    const owner = await prisma.groupMember.findFirst({
      where: { groupId, role: 'owner', status: 'active' },
      select: {
        userId: true,
        user: { select: { downgradeAt: true, subscriptionTier: true } },
      },
    });
    const downgradeAt = owner?.user.downgradeAt ?? null;
    if (!owner || !downgradeAt || parseSubscriptionTier(owner.user.subscriptionTier) !== 'free') {
      return { kind: 'default' };
    }
    const when = formatMailDate(downgradeAt);
    const { keep, remove } = await this.classifyOwnedGroups(owner.userId);
    if (remove.some((group) => group.id === groupId && !group.deletedAt)) {
      return {
        kind: 'closed',
        message: `This group will be deleted on ${when}. New uploads are closed. You can still download or delete files.`,
      };
    }
    if (keep.some((group) => group.id === groupId)) {
      return {
        kind: 'capped',
        maxBytes: storageCapForTier('small'),
        message: `This group is limited to 1 GB until ${when}. Delete files before uploading more. Older files over 1 GB are removed on that date.`,
      };
    }
    return { kind: 'default' };
  }

  /** Groups past the top two in My Groups, plus already-deleted owned groups, are removed on this date. */
  public async scheduledDeletionByGroup(groupIds: string[]): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    const unique = [...new Set(groupIds.filter(Boolean))];
    if (unique.length === 0) return result;
    const owners = await prisma.groupMember.findMany({
      where: { groupId: { in: unique }, role: 'owner', status: 'active' },
      select: { userId: true },
    });
    const userIds = [...new Set(owners.map((owner) => owner.userId))];
    if (userIds.length === 0) return result;
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, downgradeAt: { not: null } },
      select: { id: true, downgradeAt: true },
    });
    for (const user of users) {
      if (!user.downgradeAt) continue;
      const { remove } = await this.classifyOwnedGroups(user.id);
      for (const group of remove) {
        if (!group.deletedAt) result.set(group.id, user.downgradeAt);
      }
    }
    return result;
  }

  private async finishUserDowngrade(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true, downgradeAt: true },
    });
    if (!user?.downgradeAt || user.downgradeAt.getTime() > Date.now()) return;
    if (parseSubscriptionTier(user.subscriptionTier) !== 'free') {
      await prisma.user.update({ where: { id: userId }, data: { downgradeAt: null } });
      return;
    }

    const { keep, remove } = await this.classifyOwnedGroups(userId);
    const deletedNames: string[] = [];
    for (const group of remove) {
      const members = await prisma.groupMember.findMany({
        where: { groupId: group.id, status: 'active', userId: { not: userId } },
        select: { userId: true },
      });
      const removed = await purgeGroupCompletely(group.id);
      if (!removed) continue;
      deletedNames.push(group.name);
      const ids = members.map((member) => member.userId);
      if (ids.length === 0 || group.deletedAt) continue;
      await notificationService
        .createForUsers(
          ids,
          'Group deleted',
          `${group.name} was permanently deleted because the owner's plan ended.`,
          { type: 'group_storage', icon: 'warning-outline' }
        )
        .catch(() => undefined);
    }

    const smallCap = storageCapForTier('small');
    for (const group of keep) {
      const used = await groupStorage.getUsedStorageBytes(group.id);
      if (parseSizeTier(group.sizeTier) === 'small' && used <= smallCap) {
        await this.clearGrace(group.id);
        continue;
      }
      await this.finishGrace(group.id, 'small');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { downgradeAt: null },
    });
    if (deletedNames.length === 0) return;
    await notificationService
      .createForUsers(
        [userId],
        'Groups deleted',
        `These groups were permanently deleted: ${deletedNames.join(', ')}.`,
        { type: 'group_storage', icon: 'warning-outline' }
      )
      .catch(() => undefined);
  }

  public async finishGrace(groupId: string, pending: GroupSizeTier): Promise<string | null> {
    const cap = storageCapForTier(pending);
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    });
    if (!group) return null;
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

  private async classifyOwnedGroups(userId: string): Promise<{
    keep: OwnedGroupRow[];
    remove: OwnedGroupRow[];
    active: OwnedGroupRow[];
  }> {
    const [rows, user] = await Promise.all([
      this.ownedGroupRows(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { groupOrderJson: true },
      }),
    ]);
    const active = rows.filter((group) => !group.deletedAt);
    const alreadyDeleted = rows.filter((group) => group.deletedAt);
    const { keep, remove } = partitionByOrder(active, parseGroupOrderJson(user?.groupOrderJson), FREE_OWNED_GROUP_LIMIT);
    return { keep, remove: [...remove, ...alreadyDeleted], active };
  }

  private async ownedGroupRows(userId: string): Promise<OwnedGroupRow[]> {
    const rows = await prisma.groupMember.findMany({
      where: { userId, role: 'owner', status: 'active' },
      select: { group: { select: { id: true, name: true, sizeTier: true, deletedAt: true } } },
    });
    return rows.map((row) => row.group);
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
