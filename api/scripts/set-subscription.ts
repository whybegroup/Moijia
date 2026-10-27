import path from 'path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { groupBilling } from '../src/services/GroupBillingService';
import { GROUP_DOWNGRADE_GRACE_MS } from '../src/utils/groupTiers';
import { parseSubscriptionTier } from '../src/utils/subscriptionTiers';

loadEnv({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const userId = arg('user')?.trim();
  const tierRaw = arg('tier')?.trim();
  if (!userId || !tierRaw) {
    throw new Error('Usage: npm run subscription:set -- --user <userId> --tier free|pro|enterprise');
  }
  const tier = parseSubscriptionTier(tierRaw);
  if (tierRaw !== tier) {
    throw new Error('--tier must be free, pro, or enterprise');
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new Error(`User not found: ${userId}`);
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionProductId: tier === 'pro' ? 'subscription_pro' : null,
      subscriptionWillRenew: false,
      subscriptionExpiresAt: null,
      downgradeAt: null,
    },
  });
  if (tier === 'pro') await groupBilling.upgradeOwnedGroupsToMedium(userId);
  if (tier === 'enterprise') await groupBilling.clearOwnedGrace(userId);
  if (tier === 'free') {
    await groupBilling.scheduleDowngrade(userId, new Date(Date.now() + GROUP_DOWNGRADE_GRACE_MS));
  }
  console.log(`Set ${userId} to ${tier}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
