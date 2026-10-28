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

/** Same copy as the Groups tab downgrade notice. */
export function downgradeWarningBody(choosing: boolean, graceStarted: boolean): string {
  const keptLimit = graceStarted
    ? 'Groups under Kept are limited to 1 GB now. New uploads stop once a group is over 1 GB, and older files over that limit are removed on this date.'
    : 'On this date, groups you keep are trimmed to 1 GB, oldest files first.';
  if (choosing) {
    return `Only the two groups under Kept stay. Everything under Will be deleted is permanently removed, including its files. Drag a group across the split. ${keptLimit} You can still download, delete files, or transfer a group.`;
  }
  if (graceStarted) {
    return 'Groups you own are limited to 1 GB now. New uploads stop once a group is over 1 GB. Older files over that limit are removed on this date. You can still download, delete files, or transfer a group.';
  }
  return 'Groups you own become Small (1 GB). Files over that limit are removed, oldest first.';
}
