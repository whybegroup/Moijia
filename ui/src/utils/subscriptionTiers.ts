export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export const PRO_PRICE_LABEL = '$19.99/month';

export function parseSubscriptionTier(raw: unknown): SubscriptionTier {
  if (raw === 'pro' || raw === 'enterprise' || raw === 'free') return raw;
  return 'free';
}

export function subscriptionRank(tier: SubscriptionTier): number {
  if (tier === 'enterprise') return 2;
  if (tier === 'pro') return 1;
  return 0;
}

export function subscriptionPlanLabel(tier: SubscriptionTier): string {
  if (tier === 'enterprise') return 'Enterprise';
  if (tier === 'pro') return 'Pro';
  return 'Free';
}
