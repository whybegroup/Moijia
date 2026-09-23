export const FREE_OWNED_GROUP_LIMIT = 5;
export const GROUP_DOWNGRADE_GRACE_MS = 15 * 24 * 60 * 60 * 1000;

export type GroupSizeTier = 'small' | 'medium' | 'large';

const GB = 1024 * 1024 * 1024;

export const GROUP_TIERS: Record<GroupSizeTier, { gb: number; label: string }> = {
  small: { gb: 1, label: 'Small' },
  medium: { gb: 10, label: 'Medium' },
  large: { gb: 100, label: 'Large' },
};

export function parseSizeTier(raw: unknown): GroupSizeTier {
  if (raw === 'medium' || raw === 'large' || raw === 'small') return raw;
  return 'small';
}

export function storageCapForTier(tier: GroupSizeTier): number {
  return GROUP_TIERS[tier].gb * GB;
}

export const DEFAULT_GROUP_MAX_STORAGE_BYTES = storageCapForTier('small');

export function inferSizeTierFromBytes(bytes: number): GroupSizeTier {
  const n = Math.max(0, Math.floor(Number.isFinite(bytes) ? bytes : 0));
  if (n >= storageCapForTier('large') || n >= 50 * GB) return 'large';
  if (n >= storageCapForTier('medium')) return 'medium';
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
