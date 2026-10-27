import { parseSizeTier, type GroupSizeTier } from './groupTiers';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export const PRO_PRODUCT_ID = 'pro_subscription';
export const PRO_MONTHLY_PRICE_LABEL = '$19.99/mo';
/** Paid Pro access lasts 30 days from the subscribe date. */
export const PRO_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
/** A later purchase at least this long after the period start is a renewal. */
const PRO_RENEWAL_GAP_MS = 25 * 24 * 60 * 60 * 1000;

export function proPeriodEnd(startedAt: Date): Date {
  return new Date(startedAt.getTime() + PRO_PERIOD_MS);
}

/**
 * The period starts at the first subscribe date. A purchase 25 days later starts the next 30 days.
 * Sooner store dates, including sandbox renewals, do not move the period.
 */
export function resolveProPeriodStart(storedStart: Date | null, purchasedAt: Date | null, now: Date): Date {
  if (!storedStart) return purchasedAt ?? now;
  if (purchasedAt && purchasedAt.getTime() >= storedStart.getTime() + PRO_RENEWAL_GAP_MS) {
    return purchasedAt;
  }
  return storedStart;
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
