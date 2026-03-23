import { useEffect, useMemo, useState } from 'react';
import { resolveImageViewUrls } from '../services/resolveImageViewUrls';

/**
 * Maps stored image URLs (S3 canonical URLs in DB) to short-lived presigned GET URLs.
 */
export function useResolvedImageUrls(sourceUrls: string[]): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(() => new Map());

  const resolveKey = useMemo(
    () => [...new Set(sourceUrls.filter(Boolean))].sort().join('\0'),
    [sourceUrls],
  );

  useEffect(() => {
    let cancelled = false;
    const uniq = resolveKey ? resolveKey.split('\0') : [];
    (async () => {
      if (uniq.length === 0) {
        if (!cancelled) setMap(new Map());
        return;
      }
      const next = await resolveImageViewUrls(uniq);
      if (!cancelled) setMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [resolveKey]);

  return map;
}
