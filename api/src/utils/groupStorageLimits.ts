import {
  DEFAULT_GROUP_MAX_STORAGE_BYTES,
  parseSizeTier,
  storageCapForTier,
} from './groupTiers';

export {
  DEFAULT_GROUP_MAX_STORAGE_BYTES,
  FREE_OWNED_GROUP_LIMIT,
  GROUP_DOWNGRADE_GRACE_MS,
  GROUP_TIERS,
  inferSizeTierFromBytes,
  isPaidSizeTier,
  maxMembersForTier,
  memberAddsBlocked,
  parseSizeTier,
  storageCapForTier,
  type GroupSizeTier,
} from './groupTiers';

export function storageBytesFromDb(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw);
  if (typeof raw === 'bigint') {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  }
  return 0;
}

export function storageBytesToDb(n: number): string {
  return String(Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));
}

export function groupMaxStorageBytes(raw: unknown, sizeTier?: unknown): number {
  if (sizeTier === 'small' || sizeTier === 'medium' || sizeTier === 'large') {
    return storageCapForTier(sizeTier);
  }
  const n = storageBytesFromDb(raw);
  if (n <= 0) return DEFAULT_GROUP_MAX_STORAGE_BYTES;
  return n;
}

export function formatStorageBytes(bytes: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(bytes) ? bytes : 0));
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  const kb = 1024;
  if (n >= gb) {
    const g = n / gb;
    return Number.isInteger(g) || g >= 10 ? `${Math.round(g)} GB` : `${g.toFixed(1)} GB`;
  }
  if (n >= mb) {
    const m = n / mb;
    return Number.isInteger(m) || m >= 10 ? `${Math.round(m)} MB` : `${m.toFixed(1)} MB`;
  }
  if (n >= kb) {
    const k = n / kb;
    return Number.isInteger(k) || k >= 10 ? `${Math.round(k)} KB` : `${k.toFixed(1)} KB`;
  }
  return `${n} B`;
}

export function gbToBytes(gb: number): number {
  return Math.round(gb) * 1024 * 1024 * 1024;
}

export function isPaidStorageCap(bytes: number): boolean {
  const tier = parseSizeTier(
    bytes >= storageCapForTier('large') ? 'large' : bytes >= storageCapForTier('medium') ? 'medium' : 'small'
  );
  return tier !== 'small' && storageCapForTier(tier) === bytes;
}

export function paidSizeTierFromBytes(bytes: number): 'medium' | 'large' | null {
  if (bytes === storageCapForTier('large')) return 'large';
  if (bytes === storageCapForTier('medium')) return 'medium';
  return null;
}

export function groupStorageExceededMessage(maxBytes: number): string {
  return `This upload would exceed this group's storage limit (${formatStorageBytes(maxBytes)}).`;
}
