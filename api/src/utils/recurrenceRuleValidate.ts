const MAX_LEN = 2048;

/** Accept only a single-line RRULE payload (FREQ=…). */
export function normalizeRecurrenceRule(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.length > MAX_LEN) return null;
  if (/[\r\n]/.test(s)) return null;
  if (!/^FREQ=/i.test(s)) return null;
  return s;
}
