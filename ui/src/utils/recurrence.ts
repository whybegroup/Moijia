import { rrulestr } from 'rrule';
import type { EventDetailed } from '@moijia/client';
import { formatLocalDateInput } from './helpers';

/** Upper bound for RRULE COUNT (“after N times”) in the UI and when saving. */
export const MAX_RECURRENCE_COUNT = 200;

/** Last calendar day (local) allowed for “until” end: same month/day one calendar year after the series start. */
export function getRecurrenceUntilMaxCalendarDate(anchorStart: Date): Date {
  const x = new Date(anchorStart.getFullYear(), anchorStart.getMonth(), anchorStart.getDate());
  x.setFullYear(x.getFullYear() + 1);
  return x;
}

function localDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Clamp `YYYY-MM-DD` until date to the recurrence policy max (1 year after series start day). */
export function clampRecurrenceUntilYmd(untilYmd: string, seriesStart: Date): string {
  const trimmed = untilYmd.trim();
  if (!trimmed) return trimmed;
  const [y, m, d] = trimmed.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return trimmed;
  const chosen = new Date(y, m - 1, d);
  const maxDay = getRecurrenceUntilMaxCalendarDate(seriesStart);
  if (localDayMs(chosen) > localDayMs(maxDay)) return formatLocalDateInput(maxDay);
  return trimmed;
}

export function normalizeRecurrenceCount(parsed: number, fallback = 10): number {
  const base = Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
  return Math.min(MAX_RECURRENCE_COUNT, Math.max(1, base));
}

/** RFC 5545 two-letter BYDAY codes (Sunday = 0). rrule.js rejects MON/WED/… */
const DOW_RFC = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
/** Human-readable weekday names for summaries only. */
const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const BYDAY_TO_JS: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  /** Legacy rules we persisted with three-letter tokens */
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

/** Convert legacy BYDAY=MON,WED to MO,WE so rrule.js and monthly nth tokens parse. */
function normalizeRruleBydayForRfc(rule: string): string {
  return rule.replace(/\bBYDAY=([^;]+)/gi, (_m, csv: string) => {
    const parts = csv.split(',').map((x: string) => normalizeBydayCsvToken(x)).join(',');
    return `BYDAY=${parts}`;
  });
}

export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type RecurrenceEndType = 'until' | 'count';
/** Monthly: same calendar date vs same weekday position (e.g. 2nd Tuesday, or last Friday). */
export type MonthlyRecurrencePattern = 'monthDay' | 'weekdayOfMonth';

function isLastWeekdayOfMonth(d: Date): boolean {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  return next.getMonth() !== d.getMonth();
}

/** 1-based: Nth occurrence of this weekday in the calendar month of `d`. */
function weekOrdinalInMonth(d: Date): number {
  const targetDow = d.getDay();
  const dom = d.getDate();
  const y = d.getFullYear();
  const m = d.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const firstOccDom = 1 + ((targetDow - firstDow + 7) % 7);
  return Math.floor((dom - firstOccDom) / 7) + 1;
}

function buildMonthlyBydayFromStart(start: Date): string {
  const code = DOW_RFC[start.getDay()];
  if (isLastWeekdayOfMonth(start)) {
    return `BYDAY=-1${code}`;
  }
  return `BYDAY=${weekOrdinalInMonth(start)}${code}`;
}

/** RRULE BYDAY token like 2TU or -1FR (single token). */
function isMonthlyNthWeekdayBydayToken(tok: string): boolean {
  return /^-?\d+[A-Z]{2}$/i.test(tok.trim());
}

function ordinalSuffixDom(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth'] as const;

function formatWeekdayPositionPhrase(start: Date): string {
  const w = start.toLocaleDateString(undefined, { weekday: 'long' });
  if (isLastWeekdayOfMonth(start)) return `last ${w}`;
  const o = weekOrdinalInMonth(start);
  const word = ORDINAL_WORDS[o] ?? `${o}th`;
  return `${word} ${w}`;
}

function formatMonthlySummary(pattern: MonthlyRecurrencePattern, interval: number, start: Date): string {
  const iv = Math.max(1, interval);
  if (pattern === 'monthDay') {
    const dom = ordinalSuffixDom(start.getDate());
    if (iv === 1) return `Every month on the ${dom}`;
    return `Every ${iv} months on the ${dom}`;
  }
  const pos = formatWeekdayPositionPhrase(start);
  if (iv === 1) return `Every month on the ${pos}`;
  return `Every ${iv} months on the ${pos}`;
}

/** Same strings as the recurrence summary uses for monthly patterns (picker option labels). */
export function formatMonthlyPatternSummary(
  pattern: MonthlyRecurrencePattern,
  interval: number,
  start: Date
): string {
  return formatMonthlySummary(pattern, interval, start);
}

export interface RecurrenceFormState {
  preset: RecurrencePreset;
  /** Used when preset is custom + week */
  weeklyDays: number[];
  customInterval: number;
  customUnit: 'day' | 'week' | 'month' | 'year';
  /** Used for preset monthly and custom + month */
  monthlyPattern: MonthlyRecurrencePattern;
  endType: RecurrenceEndType;
  untilDate: string;
  count: string;
}

export function defaultRecurrenceFormState(): RecurrenceFormState {
  return {
    preset: 'none',
    weeklyDays: [],
    customInterval: 1,
    customUnit: 'week',
    monthlyPattern: 'monthDay',
    endType: 'count',
    untilDate: '',
    count: '10',
  };
}

/** Stored rules are `FREQ=…;…`; tolerate a leading `RRULE:` from bad payloads. */
function normalizeRrulePayload(raw: string): string {
  const t = raw.trim();
  const up = t.toUpperCase();
  if (up.startsWith('RRULE:')) return t.slice(6).trim();
  return t;
}

function normalizeRecurrenceRulePayload(raw: string): string {
  return normalizeRruleBydayForRfc(normalizeRrulePayload(raw));
}

function parseRuleParts(rule: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of rule.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim().toUpperCase();
    o[k] = part.slice(eq + 1).trim();
  }
  return o;
}

/** JS weekday 0–6 for WKST token (default MO). */
function parseWkstJs(p: Record<string, string>): number {
  const w = (p.WKST || 'MO').trim().toUpperCase();
  return BYDAY_TO_JS[w] ?? 1;
}

function weekStartCalendar(d: Date, wkstJs: number): { y: number; m: number; day: number } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const dow = new Date(y, m, day).getDay();
  const back = (dow - wkstJs + 7) % 7;
  const ws = new Date(y, m, day - back);
  return { y: ws.getFullYear(), m: ws.getMonth(), day: ws.getDate() };
}

function calendarDaysDelta(
  a: { y: number; m: number; day: number },
  b: { y: number; m: number; day: number }
): number {
  return (Date.UTC(a.y, a.m, a.day) - Date.UTC(b.y, b.m, b.day)) / 86400000;
}

function weekIntervalMatches(occ: Date, dtstart: Date, interval: number, wkstJs: number): boolean {
  const wsO = weekStartCalendar(occ, wkstJs);
  const wsD = weekStartCalendar(dtstart, wkstJs);
  const days = calendarDaysDelta(wsO, wsD);
  if (days < 0 || days % 7 !== 0) return false;
  const weekIndex = days / 7;
  return weekIndex % interval === 0;
}

/** Parse RRULE UNTIL compact UTC (…Z) into a Date cap. */
function parseRruleUntilCap(u: string): Date | null {
  const s = u.trim().replace(/Z+$/i, 'Z');
  if (!s) return null;
  const full = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i);
  if (full) {
    return new Date(
      `${full[1]}-${full[2]}-${full[3]}T${full[4]}:${full[5]}:${full[6]}Z`
    );
  }
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return new Date(`${y}-${m}-${d}T23:59:59Z`);
  }
  return null;
}

/**
 * All WEEKLY occurrences in local time (shared by expansion and “last date” for COUNT).
 * Stops at COUNT, UNTIL cap, or a long horizon—whichever comes first.
 */
function buildWeeklyOccurrenceSeriesLocal(dtstart: Date, p: Record<string, string>): Date[] {
  const interval = Math.max(1, parseInt(p.INTERVAL || '1', 10) || 1);
  const bydayStr = p.BYDAY;
  const jsDays = bydayStr ? parseByDayList(bydayStr) : [dtstart.getDay()];
  if (!jsDays.length) return [];

  const wkstJs = parseWkstJs(p);
  const maxCount = p.COUNT ? Math.max(1, parseInt(p.COUNT, 10) || 1) : Number.POSITIVE_INFINITY;
  const untilCap = p.UNTIL ? parseRruleUntilCap(p.UNTIL) : null;
  const farEnd = new Date(dtstart.getFullYear() + 50, 11, 31);
  const hardCapMs = untilCap
    ? Math.min(untilCap.getTime(), farEnd.getTime())
    : farEnd.getTime();

  const h = dtstart.getHours();
  const min = dtstart.getMinutes();
  const s = dtstart.getSeconds();
  const ms = dtstart.getMilliseconds();

  const dtstartMs = dtstart.getTime();
  const series: Date[] = [];

  let iter = new Date(dtstart.getFullYear(), dtstart.getMonth(), dtstart.getDate());

  while (iter.getTime() <= hardCapMs && series.length < maxCount) {
    if (jsDays.includes(iter.getDay())) {
      const occ = new Date(iter.getFullYear(), iter.getMonth(), iter.getDate(), h, min, s, ms);
      if (occ.getTime() >= dtstartMs - 1 && weekIntervalMatches(occ, dtstart, interval, wkstJs)) {
        series.push(occ);
        if (series.length >= maxCount) break;
      }
    }
    iter.setDate(iter.getDate() + 1);
  }

  return series;
}

/**
 * Expand WEEKLY (and only WEEKLY) using the viewer's local calendar + local clock time.
 * rrule's built-in iterator uses UTC date parts for dtstart, which shifts BYDAY for non-UTC zones.
 */
function expandWeeklyOccurrencesLocal(
  dtstart: Date,
  rawRule: string,
  rangeStart: Date,
  rangeEnd: Date
): Date[] | null {
  const p = parseRuleParts(rawRule.trim());
  if ((p.FREQ || '').toUpperCase() !== 'WEEKLY') return null;
  if (!p.COUNT && !p.UNTIL) return null;

  const series = buildWeeklyOccurrenceSeriesLocal(dtstart, p);
  const rangeEndInclusive = new Date(
    rangeEnd.getFullYear(),
    rangeEnd.getMonth(),
    rangeEnd.getDate(),
    23,
    59,
    59,
    999
  ).getTime();
  const inRange = series.filter(
    (d) => d.getTime() >= rangeStart.getTime() && d.getTime() <= rangeEndInclusive
  );
  return inRange.length > 400 ? inRange.slice(0, 400) : inRange;
}

function parseByDayList(s: string): number[] {
  return s
    .split(',')
    .map((x) => x.trim().toUpperCase().replace(/^[+-]?\d+/, ''))
    .filter(Boolean)
    .map((d) => BYDAY_TO_JS[d])
    .filter((n) => n !== undefined);
}

function isSimpleWeeklyOnStart(p: Record<string, string>, start: Date, byday: number[]): boolean {
  const interval = Math.max(1, parseInt(p.INTERVAL || '1', 10) || 1);
  if ((p.FREQ || '').toUpperCase() !== 'WEEKLY' || interval !== 1) return false;
  const wd = start.getDay();
  return byday.length === 1 && byday[0] === wd;
}

export function parseRecurrenceToForm(rule: string | null | undefined, start: Date): RecurrenceFormState {
  const base = defaultRecurrenceFormState();
  if (!rule?.trim()) return base;

  const p = parseRuleParts(normalizeRecurrenceRulePayload(rule));
  const freq = (p.FREQ || '').toUpperCase();
  const interval = Math.max(1, parseInt(p.INTERVAL || '1', 10) || 1);

  if (p.COUNT) {
    base.endType = 'count';
    base.count = String(Math.max(1, parseInt(p.COUNT, 10) || 10));
  } else if (p.UNTIL) {
    base.endType = 'until';
    // UNTIL is UTC; YYYYMMDD in the string is the UTC calendar day. We store the user's local end
    // date, so derive Y-M-D from the instant in local time (matches local EOD → ISO in appendEnd).
    const cap = parseRruleUntilCap(p.UNTIL);
    if (cap) {
      base.untilDate = clampRecurrenceUntilYmd(formatLocalYmd(cap), start);
    }
  } else {
    base.endType = 'count';
    base.count = '10';
  }

  const byday = p.BYDAY ? parseByDayList(p.BYDAY) : [];

  if (freq === 'DAILY' && interval === 1 && !p.BYDAY) {
    base.preset = 'daily';
    return base;
  }
  if (freq === 'MONTHLY' && p.BYMONTHDAY && interval === 1) {
    base.preset = 'monthly';
    base.monthlyPattern = 'monthDay';
    return base;
  }
  if (
    freq === 'MONTHLY' &&
    interval === 1 &&
    p.BYDAY &&
    !p.BYMONTHDAY &&
    !p.BYSETPOS
  ) {
    const tok = p.BYDAY.split(',')[0]!.trim().toUpperCase();
    if (isMonthlyNthWeekdayBydayToken(tok)) {
      base.preset = 'monthly';
      base.monthlyPattern = 'weekdayOfMonth';
      return base;
    }
  }
  if (freq === 'YEARLY' && interval === 1) {
    base.preset = 'yearly';
    return base;
  }
  if (isSimpleWeeklyOnStart(p, start, byday)) {
    base.preset = 'weekly';
    return base;
  }
  if (freq === 'WEEKLY' && interval === 1 && byday.length >= 1) {
    base.preset = 'custom';
    base.customUnit = 'week';
    base.customInterval = 1;
    base.weeklyDays = [...new Set(byday)].sort((a, b) => a - b);
    return base;
  }

  base.preset = 'custom';
  base.customInterval = interval;
  if (freq === 'DAILY') base.customUnit = 'day';
  else if (freq === 'WEEKLY') {
    base.customUnit = 'week';
    base.weeklyDays = byday.length ? [...new Set(byday)].sort((a, b) => a - b) : [start.getDay()];
  }   else if (freq === 'MONTHLY') {
    base.customUnit = 'month';
    if (p.BYMONTHDAY) {
      base.monthlyPattern = 'monthDay';
    } else if (
      p.BYDAY &&
      !p.BYSETPOS &&
      isMonthlyNthWeekdayBydayToken(p.BYDAY.split(',')[0]!.trim().toUpperCase())
    ) {
      base.monthlyPattern = 'weekdayOfMonth';
    } else {
      base.monthlyPattern = 'monthDay';
    }
  } else if (freq === 'YEARLY') base.customUnit = 'year';
  return base;
}

function appendEnd(parts: string[], state: RecurrenceFormState, seriesStart: Date): void {
  if (state.endType === 'until' && state.untilDate.trim()) {
    const clamped = clampRecurrenceUntilYmd(state.untilDate, seriesStart);
    const [y, m, d] = clamped.split('-').map((x) => parseInt(x, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      const localEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
      // RFC 5545 compact UTC: YYYYMMDDTHHMMSSZ (single Z). Do not append Z after stripping ms — that
      // produced …ZZ and broke parseRruleUntilCap / until display.
      const z = localEnd.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      parts.push(`UNTIL=${z}`);
      return;
    }
  }
  const n = normalizeRecurrenceCount(parseInt(state.count, 10) || 10);
  parts.push(`COUNT=${n}`);
}

export function buildRecurrenceRule(state: RecurrenceFormState, start: Date): string | null {
  if (state.preset === 'none') return null;

  const parts: string[] = [];

  switch (state.preset) {
    case 'daily':
      parts.push('FREQ=DAILY');
      break;
    case 'weekly':
      parts.push('FREQ=WEEKLY', `BYDAY=${DOW_RFC[start.getDay()]}`);
      break;
    case 'monthly':
      parts.push('FREQ=MONTHLY');
      if (state.monthlyPattern === 'weekdayOfMonth') {
        parts.push(buildMonthlyBydayFromStart(start));
      } else {
        parts.push(`BYMONTHDAY=${start.getDate()}`);
      }
      break;
    case 'yearly':
      parts.push('FREQ=YEARLY', `BYMONTH=${start.getMonth() + 1}`, `BYMONTHDAY=${start.getDate()}`);
      break;
    case 'custom': {
      const n = Math.max(1, Math.min(999, state.customInterval || 1));
      const map = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const;
      parts.push(`FREQ=${map[state.customUnit]}`);
      if (n > 1) parts.push(`INTERVAL=${n}`);
      if (state.customUnit === 'week') {
        const days =
          state.weeklyDays.length > 0
            ? [...new Set(state.weeklyDays)].sort((a, b) => a - b)
            : [start.getDay()];
        parts.push(`BYDAY=${days.map((i) => DOW_RFC[i]).join(',')}`);
      } else if (state.customUnit === 'month') {
        if (state.monthlyPattern === 'weekdayOfMonth') {
          parts.push(buildMonthlyBydayFromStart(start));
        } else {
          parts.push(`BYMONTHDAY=${start.getDate()}`);
        }
      }
      break;
    }
    default:
      return null;
  }

  appendEnd(parts, state, start);
  return parts.join(';');
}

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar date of the last occurrence when the rule uses COUNT (for summary “until …”). */
function computeCountEndDateYmd(dtstart: Date, rawRule: string): string | null {
  const norm = normalizeRecurrenceRulePayload(rawRule);
  const p = parseRuleParts(norm);
  if (!p.COUNT) return null;
  const count = Math.max(1, parseInt(p.COUNT, 10) || 1);

  if ((p.FREQ || '').toUpperCase() === 'WEEKLY') {
    const series = buildWeeklyOccurrenceSeriesLocal(dtstart, p);
    if (series.length < count) return null;
    return formatLocalYmd(series[count - 1]!);
  }

  try {
    const rule = rrulestr(`RRULE:${norm}`, { dtstart });
    const dates = rule.all();
    if (dates.length < count) return null;
    return formatLocalYmd(dates[count - 1]!);
  } catch {
    return null;
  }
}

function appendRecurrenceEndClause(
  summary: string,
  st: RecurrenceFormState,
  rawRule: string,
  dtstart: Date
): string {
  if (st.endType === 'until' && st.untilDate.trim()) {
    return `${summary} until ${st.untilDate.trim()}`;
  }
  if (st.endType === 'count') {
    const c = normalizeRecurrenceCount(parseInt(st.count, 10) || 10);
    const timesClause = ` (${c} ${c === 1 ? 'time' : 'times'})`;
    const ymd = computeCountEndDateYmd(dtstart, rawRule);
    if (ymd) return `${summary}${timesClause} until ${ymd}`;
    return `${summary}${timesClause}`;
  }
  return summary;
}

function formatCustomRecurrenceSummary(st: RecurrenceFormState, start: Date): string {
  const n = Math.max(1, st.customInterval || 1);
  if (st.customUnit === 'week') {
    const days =
      st.weeklyDays.length > 0
        ? [...new Set(st.weeklyDays)].sort((a, b) => a - b)
        : [start.getDay()];
    const letters = days.map((d) => DOW_LABEL[d] ?? '?').join(', ');
    if (n === 1) return `Every ${letters}`;
    return `Every ${n} weeks on ${letters}`;
  }
  if (st.customUnit === 'day') {
    if (n === 1) return 'Daily';
    return `Every ${n} days`;
  }
  if (st.customUnit === 'month') {
    return formatMonthlySummary(st.monthlyPattern, n, start);
  }
  const monthDay = start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  if (n === 1) return `Annually (${monthDay})`;
  return `Every ${n} years (${monthDay})`;
}

export function formatRecurrenceSummary(rule: string | null | undefined, start: Date): string {
  if (!rule?.trim()) return 'Does not repeat';
  const trimmed = rule.trim();
  const st = parseRecurrenceToForm(trimmed, start);
  const monthDay = start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

  let summary: string;
  switch (st.preset) {
    case 'none':
      return 'Does not repeat';
    case 'daily':
      summary = 'Daily';
      break;
    case 'weekly':
      summary = 'Weekly';
      break;
    case 'monthly':
      summary = formatMonthlySummary(st.monthlyPattern, 1, start);
      break;
    case 'yearly':
      summary = `Annually (${monthDay})`;
      break;
    case 'custom':
      summary = formatCustomRecurrenceSummary(st, start);
      break;
    default:
      summary = formatCustomRecurrenceSummary(st, start);
      break;
  }
  return appendRecurrenceEndClause(summary, st, trimmed, start);
}

/**
 * Summary for the recurrence picker row: when preset is `custom`, describe from form state so we
 * never collapse to “Weekly” / “Daily” after RRULE round-trip (parseRecurrenceToForm maps many
 * custom rules onto simple presets).
 */
export function formatRecurrenceFormSummary(state: RecurrenceFormState, anchorDate: Date): string {
  if (state.preset === 'none') return 'Does not repeat';
  const rule = buildRecurrenceRule(state, anchorDate);
  if (!rule) return 'Does not repeat';
  if (state.preset === 'custom') {
    const base = formatCustomRecurrenceSummary(state, anchorDate);
    return appendRecurrenceEndClause(base, state, rule, anchorDate);
  }
  if (state.preset === 'monthly') {
    const base = formatMonthlySummary(state.monthlyPattern, 1, anchorDate);
    return appendRecurrenceEndClause(base, state, rule, anchorDate);
  }
  return formatRecurrenceSummary(rule, anchorDate);
}

/** Legacy: distinct calendar rows used `__occurrenceKey` when one API row expanded to many. */
export type EventOccurrence = EventDetailed & { __occurrenceKey?: number };

/** Recurring events are materialized as separate rows; list/filter uses them as-is. */
export function expandRecurringEventsInRange(
  events: EventDetailed[],
  _rangeStart: Date,
  _rangeEnd: Date
): EventOccurrence[] {
  return events.map((e) => ({ ...e }));
}
