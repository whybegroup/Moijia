import { DateTime } from 'luxon';
import { rrulestr } from 'rrule';
import { normalizeRecurrenceRulePayload } from './recurrenceRuleNormalize';
import { parseRuleParts } from './recurrenceRuleParse';
import { buildWeeklyOccurrenceSeriesZoned, shouldUseZonedWeeklyExpand } from './recurrenceWeeklyZoned';

const MS_MATCH_TOL = 1000;
const MS_CLOSEST_FALLBACK = 120000; // 2 minutes — ISO rounding / clock skew
const MAX_EXPANDED_OCCURRENCES = 4000;

export type RecurrenceTruncateComputation =
  | { action: 'delete' }
  | { action: 'update'; newRule: string };

/** All occurrence start instants for a rule (for materializing DB rows). */
export function listOccurrenceStartsForRule(
  dtstart: Date,
  rawRule: string,
  viewerTimeZone?: string
): Date[] {
  const norm = normalizeRecurrenceRulePayload(rawRule);
  const tz = viewerTimeZone?.trim();

  if (shouldUseZonedWeeklyExpand(norm) && tz) {
    const probe = DateTime.fromJSDate(dtstart, { zone: 'utc' }).setZone(tz);
    if (probe.isValid) {
      const p = parseRuleParts(norm);
      return buildWeeklyOccurrenceSeriesZoned(dtstart, p, tz);
    }
  }

  const rule = rrulestr(`RRULE:${norm}`, { dtstart });
  const dates: Date[] = [];
  rule.all((_d) => {
    dates.push(new Date(_d.getTime()));
    return dates.length < MAX_EXPANDED_OCCURRENCES;
  });
  return dates;
}

function findTruncationIndex(dates: Date[], occurrenceStartMs: number): number {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let hit = sorted.findIndex((d) => Math.abs(d.getTime() - occurrenceStartMs) <= MS_MATCH_TOL);
  if (hit >= 0) return hit;

  let best = -1;
  let bestDiff = Infinity;
  sorted.forEach((d, i) => {
    const diff = Math.abs(d.getTime() - occurrenceStartMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  if (best >= 0 && bestDiff <= MS_CLOSEST_FALLBACK) return best;

  return -1;
}

/**
 * End the series after the last occurrence strictly before `occurrenceStartMs`.
 * If that occurrence is the first (or only), the whole event should be deleted instead.
 *
 * @param viewerTimeZone IANA zone from the client (e.g. `America/New_York`) so WEEKLY+COUNT/UNTIL
 *   matches the same instants as the app’s local-calendar expansion.
 */
export function computeRecurrenceTruncate(
  dtstart: Date,
  rawRule: string,
  occurrenceStartMs: number,
  viewerTimeZone?: string
): RecurrenceTruncateComputation {
  if (!Number.isFinite(occurrenceStartMs)) {
    throw Object.assign(new Error('Invalid occurrence start'), { status: 400 });
  }
  const norm = normalizeRecurrenceRulePayload(rawRule);
  const dates = listOccurrenceStartsForRule(dtstart, rawRule, viewerTimeZone);
  const hit = findTruncationIndex(dates, occurrenceStartMs);
  if (hit < 0) {
    throw Object.assign(new Error('That date is not part of this repeating event.'), { status: 400 });
  }
  if (hit === 0) {
    return { action: 'delete' };
  }
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const lastKept = sorted[hit - 1]!;
  const newRule = stripCountAndUntilAppendUntil(norm, lastKept);
  return { action: 'update', newRule };
}

function stripCountAndUntilAppendUntil(norm: string, untilInstant: Date): string {
  const parts = norm
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  const kept = parts.filter((p) => {
    const k = p.split('=')[0]?.toUpperCase();
    return k !== 'COUNT' && k !== 'UNTIL';
  });
  const z = untilInstant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  kept.push(`UNTIL=${z}`);
  return kept.join(';');
}
