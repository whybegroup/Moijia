export type DowngradeQuota = {
  subscriptionTier?: string | null;
  subscriptionWillRenew?: boolean;
  subscriptionStartedAt?: string | null;
  subscriptionExpiresAt?: string | null;
  downgradeAt?: string | null;
};

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Half of the provider period. */
export function downgradeGraceMs(
  startedAt: string | null | undefined,
  expiresAt: string | null | undefined
): number {
  const start = parseDate(startedAt);
  const end = parseDate(expiresAt);
  if (!start || !end) return 0;
  const period = end.getTime() - start.getTime();
  return period > 0 ? period / 2 : 0;
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
  return new Date(expires.getTime() + downgradeGraceMs(quota.subscriptionStartedAt, quota.subscriptionExpiresAt));
}
