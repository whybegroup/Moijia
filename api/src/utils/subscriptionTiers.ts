import { parseSizeTier, type GroupSizeTier } from './groupTiers';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export const PRO_PRODUCT_ID = 'pro_subscription';
export const PRO_MONTHLY_PRICE_LABEL = '$19.99/mo';

/** Half of the provider period, from its start to its expiration. */
export function downgradeGraceMs(startedAt: Date | null, expiresAt: Date | null): number {
  if (!startedAt || !expiresAt) return 0;
  const period = expiresAt.getTime() - startedAt.getTime();
  return period > 0 ? period / 2 : 0;
}

export function parseSubscriptionTier(raw: unknown): SubscriptionTier {
  if (raw === 'pro' || raw === 'enterprise' || raw === 'free') return raw;
  return 'free';
}

export function subscriptionRank(tier: SubscriptionTier): number {
  if (tier === 'enterprise') return 2;
  if (tier === 'pro') return 1;
  return 0;
}

export function planLabel(tier: SubscriptionTier): string {
  if (tier === 'enterprise') return 'Enterprise';
  if (tier === 'pro') return 'Pro';
  return 'Free';
}

/** Null means no cap. */
export function ownedGroupCapacity(tier: SubscriptionTier): number | null {
  if (tier === 'enterprise') return null;
  if (tier === 'pro') return 10;
  return 2;
}

export function defaultSizeForTier(tier: SubscriptionTier): GroupSizeTier {
  if (tier === 'pro') return 'medium';
  return 'small';
}

export function sizeForNewGroup(tier: SubscriptionTier, requested: unknown): GroupSizeTier {
  if (tier === 'enterprise') {
    return requested == null || requested === '' ? 'medium' : parseSizeTier(requested);
  }
  return defaultSizeForTier(tier);
}

/** Whether this plan can own a group that is already this size. */
export function tierAllowsSize(tier: SubscriptionTier, size: GroupSizeTier): boolean {
  if (tier === 'enterprise') return true;
  if (tier === 'pro') return size === 'small' || size === 'medium';
  return size === 'small';
}
