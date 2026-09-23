import { PrismaClient } from '@prisma/client';
import type { PurchaseHistoryEntry, PurchaseHistoryKind } from '../models/PurchaseHistory';
import { GROUP_TIERS, parseSizeTier } from '../utils/groupStorageLimits';

const prisma = new PrismaClient();

export async function recordPurchase(input: {
  userId: string;
  kind: PurchaseHistoryKind;
  title: string;
  detail?: string | null;
  productId?: string | null;
  groupId?: string | null;
  groupName?: string | null;
}): Promise<void> {
  await prisma.userPurchase.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      productId: input.productId ?? null,
      groupId: input.groupId ?? null,
      groupName: input.groupName ?? null,
    },
  });
}

async function backfillFromCurrentState(userId: string): Promise<void> {
  const count = await prisma.userPurchase.count({ where: { userId } });
  if (count > 0) return;

  const owned = await prisma.groupMember.findMany({
    where: { userId, role: 'owner', status: 'active', group: { deletedAt: null } },
    select: {
      group: {
        select: { id: true, name: true, sizeTier: true, sizeStartedAt: true, sizeProductId: true },
      },
    },
  });
  for (const row of owned) {
    const tier = parseSizeTier(row.group.sizeTier);
    if (tier === 'small') continue;
    await prisma.userPurchase.create({
      data: {
        userId,
        kind: 'size_addon',
        title: `${GROUP_TIERS[tier].label} group`,
        detail: row.group.name,
        productId: row.group.sizeProductId,
        groupId: row.group.id,
        groupName: row.group.name,
        createdAt: row.group.sizeStartedAt ?? new Date(),
      },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { extraGroupSlots: true },
  });
  const extras = Math.max(0, user?.extraGroupSlots ?? 0);
  for (let i = 0; i < extras; i += 1) {
    await prisma.userPurchase.create({
      data: {
        userId,
        kind: 'extra_group',
        title: 'Extra group slot',
        detail: '$0.99',
        productId: 'product_extra_group',
      },
    });
  }
}

export async function listPurchases(userId: string): Promise<PurchaseHistoryEntry[]> {
  await backfillFromCurrentState(userId);
  const rows = await prisma.userPurchase.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as PurchaseHistoryKind,
    productId: row.productId,
    title: row.title,
    detail: row.detail,
    groupId: row.groupId,
    groupName: row.groupName,
    createdAt: row.createdAt,
  }));
}
