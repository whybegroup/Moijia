import type { Href } from 'expo-router';

/** First value when a search param may be `string | string[]`. */
export function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s : undefined;
}

/**
 * Safe in-app path for `returnTo` query (open-redirect guard).
 * Expects a decoded path from the router (no extra decode needed).
 */
export function parseReturnToParam(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const decoded = (() => {
    try {
      return decodeURIComponent(raw.trim());
    } catch {
      return raw.trim();
    }
  })();
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return undefined;
  if (/[<>"`\\\n\r]/.test(decoded)) return undefined;
  if (/^(https?|javascript):/i.test(decoded)) return undefined;
  return decoded;
}

/** Append `returnTo` query when `sourcePath` is a valid internal path. */
export function withReturnTo(basePath: string, sourcePath: string | undefined | null): Href {
  const validated = sourcePath?.trim() ? parseReturnToParam(sourcePath.trim()) : undefined;
  if (!validated) return basePath as Href;
  const sep = basePath.includes('?') ? '&' : '?';
  return `${basePath}${sep}returnTo=${encodeURIComponent(validated)}` as Href;
}
