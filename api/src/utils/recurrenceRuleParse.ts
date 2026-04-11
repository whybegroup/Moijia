/** RRULE part parsing (aligned with ui/src/utils/recurrence.ts). */

export const BYDAY_TO_JS: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

export function parseRuleParts(rule: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of rule.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim().toUpperCase();
    o[k] = part.slice(eq + 1).trim();
  }
  return o;
}

export function parseByDayList(s: string): number[] {
  return s
    .split(',')
    .map((x) => x.trim().toUpperCase().replace(/^[+-]?\d+/, ''))
    .filter(Boolean)
    .map((d) => BYDAY_TO_JS[d])
    .filter((n): n is number => n !== undefined);
}

export function parseWkstJs(p: Record<string, string>): number {
  const w = (p.WKST || 'MO').trim().toUpperCase();
  return BYDAY_TO_JS[w] ?? 1;
}

/** Parse RRULE UNTIL compact UTC (…Z) into a Date cap. */
export function parseRruleUntilCap(u: string): Date | null {
  const s = u.trim().replace(/Z+$/i, 'Z');
  if (!s) return null;
  const full = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i);
  if (full) {
    return new Date(`${full[1]}-${full[2]}-${full[3]}T${full[4]}:${full[5]}:${full[6]}Z`);
  }
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return new Date(`${y}-${m}-${d}T23:59:59Z`);
  }
  return null;
}
