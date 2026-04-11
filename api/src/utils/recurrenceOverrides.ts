/**
 * DB stores JSON object: keys = String(occurrenceStartUtcMs), values = partial event fields for that instance.
 */

export type RecurrenceOccurrenceOverrideStored = {
  title?: string;
  description?: string | null;
  coverPhotos?: string[];
  start?: string;
  end?: string;
  isAllDay?: boolean;
  location?: string | null;
  minAttendees?: number | null;
  maxAttendees?: number | null;
  enableWaitlist?: boolean;
  allowMaybe?: boolean;
};

export type RecurrenceOverridesMap = Record<string, RecurrenceOccurrenceOverrideStored>;

export function parseRecurrenceOverridesJson(
  raw: string | null | undefined
): RecurrenceOverridesMap | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  try {
    const o = JSON.parse(String(raw));
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return undefined;
    return o as RecurrenceOverridesMap;
  } catch {
    return undefined;
  }
}

export function serializeRecurrenceOverridesJson(map: RecurrenceOverridesMap): string | null {
  const keys = Object.keys(map).filter((k) => map[k] != null && typeof map[k] === 'object');
  if (!keys.length) return null;
  const slim: RecurrenceOverridesMap = {};
  for (const k of keys) slim[k] = map[k]!;
  return JSON.stringify(slim);
}
