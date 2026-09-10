import { PrismaClient } from '@prisma/client';
import { groupStorage } from './GroupStorageService';
import { NotificationService } from './NotificationService';
import { sendOwnerEmail } from './EmailService';
import { httpError } from '../utils/httpError';
import { monthPeriodExpiresAt } from '../utils/groupPlanPeriod';
import {
  FREE_OWNED_GROUP_LIMIT,
  formatStorageBytes,
  isPaidSizeTier,
  maxMembersForTier,
  memberAddsBlocked,
  memberLimitTier,
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
    freeGroupLimit: number;
    extraGroupSlots: number;
    canCreateGroup: boolean;
  }> {
    const [ownedGroupCount, user] = await Promise.all([
      this.ownedGroupCount(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { extraGroupSlots: true } }),
    ]);
    const extraGroupSlots = Math.max(0, user?.extraGroupSlots ?? 0);
    return {
      ownedGroupCount,
      freeGroupLimit: FREE_OWNED_GROUP_LIMIT,
      extraGroupSlots,
      canCreateGroup: ownedGroupCount < FREE_OWNED_GROUP_LIMIT + extraGroupSlots,
    };
  }

  public async assertCanCreateOwnedGroup(userId: string): Promise<void> {
    const quota = await this.getOwnedGroupQuota(userId);
    if (quota.canCreateGroup) return;
    throw httpError(
      402,
      `You can create ${quota.freeGroupLimit} groups on the free plan. Buy an extra group slot to create another.`,
      { code: 'extra_group_required' }
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
    return { extraGroupSlots: updated.extraGroupSlots };
  }

  public async assertCanAddMember(groupId: string): Promise<void> {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { sizeTier: true, pendingSizeTier: true, deletedAt: true, name: true },
    });
    if (!group || group.deletedAt) throw httpError(404, 'Group not found');
    const activeCount = await prisma.groupMember.count({
      where: { groupId, status: 'active' },
    });
    const tier = memberLimitTier(
      parseSizeTier(group.sizeTier),
      group.pendingSizeTier ? parseSizeTier(group.pendingSizeTier) : null
    );
    if (!memberAddsBlocked(tier, activeCount)) return;
    const max = maxMembersForTier(tier);
    throw httpError(
      403,
      `This ${tier} group is full (${activeCount}/${max} members). Upgrade the group size to add more people.`,
      { code: 'member_limit' }
    );
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
    const isDowngrade = sizeTierRank(input.sizeTier) < sizeTierRank(currentTier);

    if (isDowngrade) {
      await this.startGrace(group.id, group.name, input.userId, input.sizeTier, null);
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
        graceEndsAt: null,
        graceNotifiedAt: null,
        sizeProductId: productIdForTier(input.sizeTier),
        sizeStartedAt: currentTier === 'small' || !group.sizeStartedAt ? new Date() : group.sizeStartedAt,
        maxStorageBytes: storageBytesToDb(cap),
      },
    });
    await notificationService.createForUsers(
      [input.userId],
      'Group size updated',
      `${group.name} is now a ${input.sizeTier} group (${formatStorageBytes(cap)}).`,
      { type: 'group_storage', icon: 'cloud-circle-outline', groupId: input.groupId, dest: 'group' }
    );
    return { maxStorageBytes: cap, sizeTier: input.sizeTier };
  }

  /**
   * Store billing: Apple/Google keep paid access until period end.
   * Owner-scheduled downgrades stay pending even while the current entitlement is still active.
   * When the current add-on is gone, schedule the next smaller tier they still pay for (or Small).
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
        graceEndsAt: true,
        graceNotifiedAt: true,
      },
    });

    const claimed = new Set<PaidSizeTier>();
    const paid = groups
      .filter((g) => isPaidSizeTier(parseSizeTier(g.sizeTier)))
      .sort((a, b) => {
        const rank = (t: string) => (t === 'large' ? 2 : t === 'medium' ? 1 : 0);
        return rank(b.sizeTier) - rank(a.sizeTier);
      });

    for (const group of paid) {
      const tier = parseSizeTier(group.sizeTier) as PaidSizeTier;
      const covered =
        tier === 'large'
          ? entitlements.largeActive && !claimed.has('large')
          : entitlements.mediumActive && !claimed.has('medium');
      if (covered) {
        claimed.add(tier);
        continue;
      }

      const fallback: GroupSizeTier =
        tier === 'large' && entitlements.mediumActive && !claimed.has('medium') ? 'medium' : 'small';
      if (fallback === 'medium') claimed.add('medium');
      await this.startGrace(group.id, group.name, userId, fallback, group.graceNotifiedAt);
    }
  }

  public async startGrace(
    groupId: string,
    groupName: string,
    ownerId: string,
    pendingSizeTier: GroupSizeTier,
    alreadyNotifiedAt: Date | null | undefined
  ): Promise<void> {
    const existing = await prisma.group.findUnique({
      where: { id: groupId },
      select: { graceEndsAt: true, graceNotifiedAt: true, sizeTier: true, sizeStartedAt: true },
    });
    if (!existing) return;
    if (parseSizeTier(existing.sizeTier) === pendingSizeTier) {
      await prisma.group.update({
        where: { id: groupId },
        data: { pendingSizeTier: null, graceEndsAt: null, graceNotifiedAt: null },
      });
      return;
    }

    const periodEnd = monthPeriodExpiresAt(existing.sizeStartedAt ?? new Date());
    const graceEndsAt = existing.graceEndsAt ?? periodEnd;
    await prisma.group.update({
      where: { id: groupId },
      data: { pendingSizeTier, graceEndsAt },
    });

    if (alreadyNotifiedAt ?? existing.graceNotifiedAt) return;
    await prisma.group.update({
      where: { id: groupId },
      data: { graceNotifiedAt: new Date() },
    });

    const ends = graceEndsAt.toLocaleDateString();
    const cap = storageCapForTier(pendingSizeTier);
    const memberLine =
      maxMembersForTier(pendingSizeTier) == null
        ? ''
        : ` Member limit will be ${maxMembersForTier(pendingSizeTier)}.`;
    const body =
      `${groupName} is scheduled to become a ${pendingSizeTier} group on ${ends}. ` +
      `Until then, storage stays as-is so you can fix billing or download files. ` +
      `After that, older files will be deleted until usage is under ${formatStorageBytes(cap)}.` +
      memberLine;

    await notificationService
      .createForUser(ownerId, 'Group size grace period', body, {
        type: 'group_storage',
        icon: 'warning-outline',
        groupId,
        dest: 'group',
      })
      .catch(() => undefined);

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
    await groupStorage.purgeOldestUntilUnderCap(groupId, cap);
    await prisma.group.update({
      where: { id: groupId },
      data: {
        sizeTier: pending,
        pendingSizeTier: null,
        graceEndsAt: null,
        graceNotifiedAt: null,
        sizeProductId: isPaidSizeTier(pending) ? productIdForTier(pending as PaidSizeTier) : null,
        ...(isPaidSizeTier(pending) ? {} : { sizeStartedAt: null }),
        maxStorageBytes: storageBytesToDb(cap),
      },
    });
  }
}

export const groupBilling = new GroupBillingService();
