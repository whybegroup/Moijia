/**
 * Event start/end contract
 * ------------------------
 * Wire + storage: UTC ISO-8601 with `Z` (RFC 3339), e.g. from `Date.prototype.toISOString()`.
 * UI forms: separate local calendar date (YYYY-MM-DD) and wall time (HH:mm) in the device timezone.
 *
 * - To **send** to the API: `localWallDateTimeToUtcIso` / `localWallDateStartOfDayToUtcIso` / `localWallDateEndOfDayToUtcIso`.
 * - To **show** in the UI: `parseUtcIso` or `new Date(iso)` then `getFullYear()`, `getHours()`, etc. (all local),
 *   or `formatWallDateFromUtcIso` / `formatWallTimeHmFromUtcIso`.
 */

import { formatLocalDateInput } from './helpers';

export function parseUtcIso(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid UTC datetime: ${iso}`);
  }
  return d;
}

/** Interpret stored instant in the user's timezone (same as `new Date(iso)` when `iso` includes `Z`). */
export function formatWallDateFromUtcIso(iso: string): string {
  return formatLocalDateInput(parseUtcIso(iso));
}

/** 24h HH:mm in the user's timezone. */
export function formatWallTimeHmFromUtcIso(iso: string): string {
  const d = parseUtcIso(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Combine local date + wall time (no offset in string) → same interpretation as
 * `new Date(\`${dateYmd}T${time}:00\`)` → UTC ISO for the API.
 */
export function localWallDateTimeToUtcIso(dateYmd: string, timeHm: string): string {
  const [sh, sm] = timeHm.split(':').map((x) => parseInt(x, 10));
  const h = Number.isFinite(sh) ? sh : 0;
  const min = Number.isFinite(sm) ? sm : 0;
  const local = new Date(
    `${dateYmd}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
  );
  if (Number.isNaN(local.getTime())) {
    throw new Error(`Invalid local date/time: ${dateYmd} ${timeHm}`);
  }
  return local.toISOString();
}

export function localWallDateStartOfDayToUtcIso(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid date: ${dateYmd}`);
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function localWallDateEndOfDayToUtcIso(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid date: ${dateYmd}`);
  }
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** Local `Date` for recurrence anchor (weekday / month-day from user's calendar). */
export function localWallDateTimeToDate(dateYmd: string, timeHm: string): Date {
  const [sh, sm] = timeHm.split(':').map((x) => parseInt(x, 10));
  const h = Number.isFinite(sh) ? sh : 0;
  const min = Number.isFinite(sm) ? sm : 0;
  const local = new Date(
    `${dateYmd}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
  );
  return Number.isNaN(local.getTime()) ? new Date() : local;
}

/** Form snapshot for event create/edit — same interpretation as API payloads. */
export type EventFormTimeRangeFields = {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

/** True when `end` is strictly after `start` (timed or all-day). */
export function isValidEventFormTimeRange(form: EventFormTimeRangeFields): boolean {
  if (!form.startDate?.trim() || !form.endDate?.trim()) return false;
  if (!form.allDay) {
    if (!form.startTime?.trim() || !form.endTime?.trim()) return false;
  }
  try {
    const startIso = form.allDay
      ? localWallDateStartOfDayToUtcIso(form.startDate.trim())
      : localWallDateTimeToUtcIso(form.startDate.trim(), form.startTime.trim());
    const endIso = form.allDay
      ? localWallDateEndOfDayToUtcIso(form.endDate.trim())
      : localWallDateTimeToUtcIso(form.endDate.trim(), form.endTime.trim());
    return new Date(endIso).getTime() > new Date(startIso).getTime();
  } catch {
    return false;
  }
}
