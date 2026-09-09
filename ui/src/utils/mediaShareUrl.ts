import { INVITE_LINK_ORIGIN } from './inviteLink';

const STORAGE_KEY_PREFIX = 'storage';

function pathnameOf(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(new URL(raw).pathname);
  } catch {
    return raw.split(/[?#]/)[0] || null;
  }
}

function isSafeSegment(s: string): boolean {
  return /^[A-Za-z0-9._~-]{1,200}$/.test(s);
}

/** `storage/{userId}/{file}` from an S3 URL or a `moijia.com/f/...` share URL. */
export function storageKeyFromMediaUrl(url: string): string | null {
  const path = pathnameOf(url);
  if (!path || path.includes('..') || path.includes('\\')) return null;
  const normalized = path.replace(/^\/+/, '');
  const m =
    normalized.match(/(?:^|\/)storage\/([^/]+)\/([^/]+)$/i) ||
    normalized.match(/^f\/([^/]+)\/([^/]+)$/i);
  if (!m) return null;
  const userId = m[1];
  const fileName = m[2];
  if (!isSafeSegment(userId) || !isSafeSegment(fileName)) return null;
  return `${STORAGE_KEY_PREFIX}/${userId}/${fileName}`;
}

/** Public `https://moijia.com/f/{userId}/{file}` URL, or null if not an app-managed upload. */
export function toMoijiaMediaShareUrl(url: string): string | null {
  const key = storageKeyFromMediaUrl(url);
  if (!key) return null;
  const parts = key.split('/');
  if (parts.length !== 3 || parts[0] !== STORAGE_KEY_PREFIX) return null;
  return `${INVITE_LINK_ORIGIN}/f/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}`;
}

/** Convert managed S3 URLs to moijia.com share URLs; leave everything else unchanged. */
export function toPublicFacingMediaUrl(url: string): string {
  const trimmed = url?.trim();
  if (!trimmed) return url;
  return toMoijiaMediaShareUrl(trimmed) ?? trimmed;
}
