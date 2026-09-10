import {
  DEFAULT_GROUP_MAX_STORAGE_BYTES,
  GROUP_TIERS,
  parseSizeTier,
  storageCapForTier,
  type GroupSizeTier,
} from './groupTiers';

export { DEFAULT_GROUP_MAX_STORAGE_BYTES } from './groupTiers';

export const GROUP_STORAGE_FULL_TITLE = 'Not enough storage';
export const GROUP_STORAGE_FULL_MESSAGE =
  'This group has no available storage left. Delete files or ask the owner to increase the limit before uploading.';
export const GROUP_STORAGE_CHECK_FAILED_MESSAGE =
  "Could not check this group's storage. Try again before uploading.";
export const GROUP_STORAGE_UNKNOWN_SIZE_MESSAGE =
  "Could not determine this file's size. Try another file.";

export function groupStorageDoesNotFitMessage(fileBytes: number, remainingBytes: number): string {
  return `This file is ${formatStorageBytes(fileBytes)}, but only ${formatStorageBytes(remainingBytes)} is left. Delete files or choose a smaller file.`;
}

export function resolveGroupMaxStorageBytes(
  max?: number | null,
  sizeTier?: string | null
): number {
  if (sizeTier === 'small' || sizeTier === 'medium' || sizeTier === 'large') {
    return storageCapForTier(sizeTier);
  }
  const n = max && max > 0 ? max : DEFAULT_GROUP_MAX_STORAGE_BYTES;
  return n;
}

function storageNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

export function groupStorageRemainingBytes(
  used?: unknown,
  max?: unknown,
  sizeTier?: string | null
): number {
  const usedN = storageNumber(used);
  const maxN = resolveGroupMaxStorageBytes(storageNumber(max), sizeTier);
  return Math.max(0, maxN - usedN);
}

export function isGroupStorageFull(used?: unknown, max?: unknown, sizeTier?: string | null): boolean {
  return groupStorageRemainingBytes(used, max, sizeTier) <= 0;
}

export const PAID_SIZE_TIERS = ['medium', 'large'] as const;
export type PaidSizeTier = (typeof PAID_SIZE_TIERS)[number];

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

export function sizeTierFromGroup(group: {
  sizeTier?: string | null;
  maxStorageBytes?: number | null;
}): GroupSizeTier {
  if (group.sizeTier) return parseSizeTier(group.sizeTier);
  const max = group.maxStorageBytes ?? 0;
  if (max >= GROUP_TIERS.large.maxStorageBytes) return 'large';
  if (max >= GROUP_TIERS.medium.maxStorageBytes) return 'medium';
  return 'small';
}
