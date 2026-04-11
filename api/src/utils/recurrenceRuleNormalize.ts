/**
 * Normalize stored RRULE payloads for rrule.js (must match ui/src/utils/recurrence.ts semantics).
 */

const BYDAY_TO_JS: Record<string, number> = {
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

const RFC_BYDAY_TOKENS = new Set(Object.keys(BYDAY_TO_JS).filter((k) => k.length === 2));

const THREE_LETTER_WEEKDAY_TO_RFC: Record<string, string> = {
  SUN: 'SU',
  MON: 'MO',
  TUE: 'TU',
  WED: 'WE',
  THU: 'TH',
  FRI: 'FR',
  SAT: 'SA',
};

function weekdayLettersToRfc(dayLetters: string): string {
  const u = dayLetters.toUpperCase();
  if (RFC_BYDAY_TOKENS.has(u)) return u;
  return THREE_LETTER_WEEKDAY_TO_RFC[u] ?? u;
}

function normalizeBydayCsvToken(tok: string): string {
  const t = tok.trim();
  const m = t.match(/^([+-]?\d+)([A-Za-z]+)$/);
  if (m) {
    return m[1] + weekdayLettersToRfc(m[2]);
  }
  return weekdayLettersToRfc(t);
}

function normalizeRruleBydayForRfc(rule: string): string {
  return rule.replace(/\bBYDAY=([^;]+)/gi, (_m, csv: string) => {
    const parts = csv.split(',').map((x: string) => normalizeBydayCsvToken(x)).join(',');
    return `BYDAY=${parts}`;
  });
}

function normalizeRrulePayload(raw: string): string {
  const t = raw.trim();
  const up = t.toUpperCase();
  if (up.startsWith('RRULE:')) return t.slice(6).trim();
  return t;
}

export function normalizeRecurrenceRulePayload(raw: string): string {
  return normalizeRruleBydayForRfc(normalizeRrulePayload(raw));
}
