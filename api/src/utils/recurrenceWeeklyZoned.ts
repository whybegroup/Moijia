import { DateTime } from 'luxon';
import {
  parseByDayList,
  parseRuleParts,
  parseRruleUntilCap,
  parseWkstJs,
} from './recurrenceRuleParse';

/** Luxon weekday 1–7 (Mon–Sun) → JS getDay() 0–6 (Sun–Sat). */
function luxonWeekdayToJs(d: DateTime): number {
  return d.weekday === 7 ? 0 : d.weekday;
}

function weekStartInZone(d: DateTime, wkstJs: number): DateTime {
  const jsDow = luxonWeekdayToJs(d);
  const back = (jsDow - wkstJs + 7) % 7;
  return d.startOf('day').minus({ days: back });
}

function weekIntervalMatchesZoned(occ: DateTime, dtstart: DateTime, interval: number, wkstJs: number): boolean {
  const wsO = weekStartInZone(occ, wkstJs);
  const wsD = weekStartInZone(dtstart, wkstJs);
  const days = (wsO.toMillis() - wsD.toMillis()) / 86400000;
  if (days < 0 || days % 7 !== 0) return false;
  const weekIndex = days / 7;
  return weekIndex % interval === 0;
}

/**
 * WEEKLY series with COUNT/UNTIL, using the viewer’s IANA zone (matches app weekly-local expansion).
 */
export function buildWeeklyOccurrenceSeriesZoned(
  dtstart: Date,
  p: Record<string, string>,
  viewerTimeZone: string
): Date[] {
  const interval = Math.max(1, parseInt(p.INTERVAL || '1', 10) || 1);
  const bydayStr = p.BYDAY;
  const jsDays = bydayStr ? parseByDayList(bydayStr) : [luxonWeekdayToJs(DateTime.fromJSDate(dtstart, { zone: 'utc' }).setZone(viewerTimeZone))];
  if (!jsDays.length) return [];

  const wkstJs = parseWkstJs(p);
  const maxCount = p.COUNT ? Math.max(1, parseInt(p.COUNT, 10) || 1) : Number.POSITIVE_INFINITY;
  const untilCap = p.UNTIL ? parseRruleUntilCap(p.UNTIL) : null;

  const anchor = DateTime.fromJSDate(dtstart, { zone: 'utc' }).setZone(viewerTimeZone);
  const h = anchor.hour;
  const min = anchor.minute;
  const sec = anchor.second;
  const ml = anchor.millisecond;
  const dtstartMs = dtstart.getTime();

  const farEnd = anchor.plus({ years: 50 }).endOf('year');
  const hardCapMs = untilCap
    ? Math.min(untilCap.getTime(), farEnd.toMillis())
    : farEnd.toMillis();

  const series: Date[] = [];
  let iter = anchor.startOf('day');

  while (iter.toMillis() <= hardCapMs && series.length < maxCount) {
    const jsDow = luxonWeekdayToJs(iter);
    if (jsDays.includes(jsDow)) {
      const occWall = iter.set({ hour: h, minute: min, second: sec, millisecond: ml });
      const occUtc = occWall.toUTC().toJSDate();
      if (occUtc.getTime() >= dtstartMs - 1 && weekIntervalMatchesZoned(occWall, anchor, interval, wkstJs)) {
        series.push(occUtc);
        if (series.length >= maxCount) break;
      }
    }
    iter = iter.plus({ days: 1 });
  }

  return series;
}

export function shouldUseZonedWeeklyExpand(normRule: string): boolean {
  const p = parseRuleParts(normRule.trim());
  if ((p.FREQ || '').toUpperCase() !== 'WEEKLY') return false;
  return !!(p.COUNT || p.UNTIL);
}
