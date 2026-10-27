import { GROUP_DOWNGRADE_GRACE_DAYS } from './groupTiers';

const GRACE_MS = GROUP_DOWNGRADE_GRACE_DAYS * 24 * 60 * 60 * 1000;

export type DowngradeQuota = {
  subscriptionTier?: string | null;
  subscriptionWillRenew?: boolean;
  subscriptionExpiresAt?: string | null;
  downgradeAt?: string | null;
};

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True once a plan is ending, or the grace period before deletion has started. */
export function downgradeIsPending(quota: DowngradeQuota | null | undefined): boolean {
  if (!quota) return false;
  if (quota.downgradeAt) return true;
  if (quota.subscriptionTier === 'enterprise' && quota.subscriptionExpiresAt) return true;
  return quota.subscriptionTier === 'pro' && quota.subscriptionWillRenew === false;
}

/** When extra owned groups are deleted. Null when that date is not known yet. */
export function pendingDowngradeAt(quota: DowngradeQuota | null | undefined): Date | null {
  if (!quota || !downgradeIsPending(quota)) return null;
  const scheduled = parseDate(quota.downgradeAt);
  if (scheduled) return scheduled;
  const expires = parseDate(quota.subscriptionExpiresAt);
  if (!expires) return null;
  return new Date(expires.getTime() + GRACE_MS);
}
