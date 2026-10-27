import path from 'path';
import { config as loadEnv } from 'dotenv';
import { Prisma, PrismaClient } from '../src/generated/prisma';
import { groupBilling } from '../src/services/GroupBillingService';
import { PRO_PRODUCT_ID, downgradeGraceMs, parseSubscriptionTier } from '../src/utils/subscriptionTiers';

loadEnv({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseExpires(raw: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = dateOnly ? new Date(`${raw}T23:59:59.999Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error('--expires must be YYYY-MM-DD or an ISO time');
  }
  return date;
}

async function main(): Promise<void> {
  const userId = arg('user')?.trim();
  const tierRaw = arg('tier')?.trim();
  const warningFlag = hasFlag('warning');
  const clearWarning = hasFlag('clear-warning');
  const expiresRaw = arg('expires')?.trim();
  const clearExpires = hasFlag('clear-expires');
  if (!userId || (!tierRaw && !warningFlag && !clearWarning && !expiresRaw && !clearExpires)) {
    throw new Error(
      'Usage:\n' +
        '  npm run subscription:set -- --user <id> --tier free|pro|enterprise\n' +
        '  npm run subscription:set -- --user <id> --warning "Payment stopped" --expires 2026-11-30\n' +
        '  npm run subscription:set -- --user <id> --clear-warning --clear-expires'
    );
  }
  const tier = tierRaw ? parseSubscriptionTier(tierRaw) : null;
  if (tierRaw && tierRaw !== tier) {
    throw new Error('--tier must be free, pro, or enterprise');
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      subscriptionTier: true,
      subscriptionStartedAt: true,
      subscriptionExpiresAt: true,
    },
  });
  if (!user) throw new Error(`User not found: ${userId}`);

  const nextTier = tier ?? parseSubscriptionTier(user.subscriptionTier);
  if ((expiresRaw || clearExpires) && nextTier !== 'enterprise' && tier !== 'enterprise') {
    throw new Error('Expiration is only for an Enterprise plan');
  }

  const data: Prisma.UserUpdateInput = {};
  if (tier) {
    data.subscriptionTier = tier;
    data.subscriptionProductId = tier === 'pro' ? PRO_PRODUCT_ID : null;
    data.subscriptionWillRenew = tier === 'pro';
    data.subscriptionStartedAt = tier === 'pro' ? new Date() : null;
    data.downgradeAt = null;
    if (tier === 'pro') data.subscriptionExpiresAt = null;
    else if (tier === 'free') data.subscriptionExpiresAt = null;
    else if (!expiresRaw && !clearExpires) data.subscriptionExpiresAt = null;
    if (tier === 'enterprise' && !warningFlag && !clearWarning) data.subscriptionWarning = null;
  }
  if (clearWarning) data.subscriptionWarning = null;
  if (warningFlag) {
    const text = arg('warning')?.trim() ?? '';
    if (!text) throw new Error('--warning requires a message. Use --clear-warning to remove it.');
    data.subscriptionWarning = text;
  }
  if (clearExpires) data.subscriptionExpiresAt = null;
  if (expiresRaw) {
    data.subscriptionExpiresAt = parseExpires(expiresRaw);
    if (nextTier === 'enterprise') {
      data.downgradeAt = null;
      data.subscriptionStartedAt = user.subscriptionStartedAt ?? new Date();
    }
  }

  await prisma.user.update({ where: { id: userId }, data });
  if (tier === 'pro') await groupBilling.upgradeOwnedGroupsToMedium(userId);
  if (tier === 'enterprise' || (nextTier === 'enterprise' && (clearExpires || Boolean(expiresRaw)))) {
    await groupBilling.clearOwnedGrace(userId);
  }
  if (tier === 'free') {
    const graceMs = downgradeGraceMs(user.subscriptionStartedAt, user.subscriptionExpiresAt);
    await groupBilling.scheduleDowngrade(userId, new Date(Date.now() + graceMs));
  }
  const saved = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, subscriptionExpiresAt: true, subscriptionWarning: true },
  });
  console.log(
    `Set ${userId} to ${saved?.subscriptionTier}` +
      `${saved?.subscriptionExpiresAt ? `, expires ${saved.subscriptionExpiresAt.toISOString()}` : ''}` +
      `${saved?.subscriptionWarning ? `, warning set` : ''}`
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
