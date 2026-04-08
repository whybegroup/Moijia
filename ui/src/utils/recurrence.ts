import { rrulestr } from 'rrule';
import type { EventDetailed } from '@moija/client';

const DOW_SHORT = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const BYDAY_TO_JS: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type RecurrenceEndType = 'until' | 'count';

export interface RecurrenceFormState {
  preset: RecurrencePreset;
  /** Used when preset is custom + week */
  weeklyDays: number[];
  customInterval: number;
  customUnit: 'day' | 'week' | 'month' | 'year';
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
    endType: 'count',
    untilDate: '',
    count: '10',
  };
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
  const s = u.trim();
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

  const interval = Math.max(1, parseInt(p.INTERVAL || '1', 10) || 1);
  const bydayStr = p.BYDAY;
  const jsDays = bydayStr ? parseByDayList(bydayStr) : [dtstart.getDay()];
  if (!jsDays.length) return null;

  const wkstJs = parseWkstJs(p);
  if (!p.COUNT && !p.UNTIL) return null;
  const maxCount = p.COUNT ? Math.max(1, parseInt(p.COUNT, 10) || 1) : Number.POSITIVE_INFINITY;
  const untilCap = p.UNTIL ? parseRruleUntilCap(p.UNTIL) : null;

  const h = dtstart.getHours();
  const min = dtstart.getMinutes();
  const s = dtstart.getSeconds();
  const ms = dtstart.getMilliseconds();

  const dtstartMs = dtstart.getTime();
  const series: Date[] = [];

  let iter = new Date(dtstart.getFullYear(), dtstart.getMonth(), dtstart.getDate());
  const rangeCap = new Date(rangeEnd.getTime() + 86400000 * 370);
  const hardCap = untilCap && untilCap.getTime() < rangeCap.getTime() ? untilCap : rangeCap;

  while (iter.getTime() <= hardCap.getTime() && series.length < maxCount) {
    if (jsDays.includes(iter.getDay())) {
      const occ = new Date(iter.getFullYear(), iter.getMonth(), iter.getDate(), h, min, s, ms);
      if (occ.getTime() >= dtstartMs - 1 && weekIntervalMatches(occ, dtstart, interval, wkstJs)) {
        series.push(occ);
        if (series.length >= maxCount) break;
      }
    }
    iter.setDate(iter.getDate() + 1);
  }

  const inRange = series.filter(
    (d) => d.getTime() >= rangeStart.getTime() && d.getTime() <= rangeEnd.getTime()
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

  const p = parseRuleParts(rule.trim());
  const freq = (p.FREQ || '').toUpperCase();
  const interval = Math.max(1, parseInt(p.INTERVAL || '1', 10) || 1);

  if (p.COUNT) {
    base.endType = 'count';
    base.count = String(Math.max(1, parseInt(p.COUNT, 10) || 10));
  } else if (p.UNTIL) {
    base.endType = 'until';
    const u = p.UNTIL;
    if (u.length >= 8) {
      const y = parseInt(u.slice(0, 4), 10);
      const m = parseInt(u.slice(4, 6), 10);
      const d = parseInt(u.slice(6, 8), 10);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        base.untilDate = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
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
    return base;
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
  } else if (freq === 'MONTHLY') base.customUnit = 'month';
  else if (freq === 'YEARLY') base.customUnit = 'year';
  return base;
}

function appendEnd(parts: string[], state: RecurrenceFormState): void {
  if (state.endType === 'until' && state.untilDate.trim()) {
    const [y, m, d] = state.untilDate.split('-').map((x) => parseInt(x, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      const localEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
      const z = localEnd.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') + 'Z';
      parts.push(`UNTIL=${z}`);
      return;
    }
  }
  const n = Math.max(1, parseInt(state.count, 10) || 10);
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
      parts.push('FREQ=WEEKLY', `BYDAY=${DOW_SHORT[start.getDay()]}`);
      break;
    case 'monthly':
      parts.push('FREQ=MONTHLY', `BYMONTHDAY=${start.getDate()}`);
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
        parts.push(`BYDAY=${days.map((i) => DOW_SHORT[i]).join(',')}`);
      }
      break;
    }
    default:
      return null;
  }

  appendEnd(parts, state);
  return parts.join(';');
}

export function formatRecurrenceSummary(rule: string | null | undefined, start: Date): string {
  if (!rule?.trim()) return 'Does not repeat';
  const st = parseRecurrenceToForm(rule, start);
  const monthDay = start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

  switch (st.preset) {
    case 'none':
      return 'Does not repeat';
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return `Monthly (day ${start.getDate()})`;
    case 'yearly':
      return `Annually (${monthDay})`;
    case 'custom':
      return 'Custom';
    default:
      return 'Custom';
  }
}

export type EventOccurrence = EventDetailed & { __occurrenceKey?: number };

function recurrenceExdateSet(ev: EventDetailed & { recurrenceExdates?: number[] }): Set<number> {
  const x = ev.recurrenceExdates;
  if (!x?.length) return new Set();
  return new Set(x.filter((n) => typeof n === 'number' && Number.isFinite(n)));
}

export function expandRecurringEventsInRange(
  events: EventDetailed[],
  rangeStart: Date,
  rangeEnd: Date
): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const ev of events) {
    const raw = (ev as EventDetailed & { recurrenceRule?: string | null }).recurrenceRule?.trim();
    if (!raw) {
      out.push(ev);
      continue;
    }
    const dtstart = new Date(ev.start as string);
    const duration = new Date(ev.end as string).getTime() - dtstart.getTime();
    const excluded = recurrenceExdateSet(ev as EventDetailed & { recurrenceExdates?: number[] });
    try {
      const weeklyLocal = expandWeeklyOccurrencesLocal(dtstart, raw, rangeStart, rangeEnd);
      const dates =
        weeklyLocal ??
        (() => {
          const rule = rrulestr(`RRULE:${raw}`, { dtstart });
          let d = rule.between(rangeStart, rangeEnd, true);
          if (d.length > 400) d = d.slice(0, 400);
          return d;
        })();
      for (const d of dates) {
        if (excluded.has(d.getTime())) continue;
        out.push({
          ...ev,
          start: d.toISOString(),
          end: new Date(d.getTime() + duration).toISOString(),
          __occurrenceKey: d.getTime(),
        });
      }
    } catch {
      out.push(ev);
    }
  }
  return out;
}
