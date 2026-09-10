export const FREE_OWNED_GROUP_LIMIT = 5;
export const GROUP_DOWNGRADE_GRACE_MS = 15 * 24 * 60 * 60 * 1000;

export type GroupSizeTier = 'small' | 'medium' | 'large';

const GB = 1024 * 1024 * 1024;

export const GROUP_TIERS: Record<
  GroupSizeTier,
  { maxStorageBytes: number; maxMembers: number | null; label: string }
> = {
  small: { maxStorageBytes: 1 * GB, maxMembers: 20, label: 'Small' },
  medium: { maxStorageBytes: 10 * GB, maxMembers: 50, label: 'Medium' },
  large: { maxStorageBytes: 100 * GB, maxMembers: null, label: 'Large' },
};

export const DEFAULT_GROUP_MAX_STORAGE_BYTES = GROUP_TIERS.small.maxStorageBytes;

export function parseSizeTier(raw: unknown): GroupSizeTier {
  if (raw === 'medium' || raw === 'large' || raw === 'small') return raw;
  return 'small';
}

export function storageCapForTier(tier: GroupSizeTier): number {
  return GROUP_TIERS[tier].maxStorageBytes;
}

export function maxMembersForTier(tier: GroupSizeTier): number | null {
  return GROUP_TIERS[tier].maxMembers;
}

export function inferSizeTierFromBytes(bytes: number): GroupSizeTier {
  const n = Math.max(0, Math.floor(Number.isFinite(bytes) ? bytes : 0));
  if (n >= GROUP_TIERS.large.maxStorageBytes || n >= 50 * GB) return 'large';
  if (n >= GROUP_TIERS.medium.maxStorageBytes) return 'medium';
  return 'small';
}

export function isPaidSizeTier(tier: GroupSizeTier): boolean {
  return tier === 'medium' || tier === 'large';
}

export function sizeTierRank(tier: GroupSizeTier): number {
  if (tier === 'large') return 2;
  if (tier === 'medium') return 1;
  return 0;
}

/** While a smaller size is scheduled, member caps follow the upcoming plan. */
export function memberLimitTier(
  current: GroupSizeTier,
  pending?: GroupSizeTier | null
): GroupSizeTier {
  if (pending && sizeTierRank(pending) < sizeTierRank(current)) return pending;
  return current;
}

export function memberAddsBlocked(tier: GroupSizeTier, activeMemberCount: number): boolean {
  const max = maxMembersForTier(tier);
  return max != null && activeMemberCount >= max;
}
