import { PrismaClient } from '@prisma/client';
import type { PurchaseHistoryEntry, PurchaseHistoryKind } from '../models/PurchaseHistory';
import { PRO_MONTHLY_PRICE_LABEL, PRO_PRODUCT_ID } from '../utils/subscriptionTiers';

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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, subscriptionProductId: true },
  });
  if (user?.subscriptionTier !== 'pro' && user?.subscriptionProductId !== PRO_PRODUCT_ID) return;
  await prisma.userPurchase.create({
    data: {
      userId,
      kind: 'subscription',
      title: 'Pro',
      detail: PRO_MONTHLY_PRICE_LABEL,
      productId: PRO_PRODUCT_ID,
    },
  });
}

export async function listPurchases(userId: string): Promise<PurchaseHistoryEntry[]> {
  await backfillFromCurrentState(userId);
  const rows = await prisma.userPurchase.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
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
