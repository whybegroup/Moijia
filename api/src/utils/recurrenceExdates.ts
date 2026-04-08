/** DB stores JSON array of UTC ms (occurrence starts) to omit when expanding a series. */

export function parseRecurrenceExdatesJson(raw: string | null | undefined): number[] | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return undefined;
    const nums = arr.filter((x) => typeof x === 'number' && Number.isFinite(x)) as number[];
    return nums.length ? nums : undefined;
  } catch {
    return undefined;
  }
}

export function serializeRecurrenceExdatesJson(arr: number[]): string | null {
  const u = [...new Set(arr)].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return u.length ? JSON.stringify(u) : null;
}
