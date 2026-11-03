import { formatEventWhen, formatZonedClock } from './timeZone';

function localeZone(timeZone?: string | null): { timeZone: string } {
  return { timeZone: timeZone?.trim() || 'UTC' };
}

export function formatNotificationEventWhen(
  instant: Date,
  timeZone?: string | null,
  isAllDay?: boolean | null
): string {
  return formatEventWhen(instant, timeZone, isAllDay);
}

/** Weekday + date (+ time) for share cards, in the given IANA zone when set. */
export function formatShareInstant(
  instant: Date,
  timeZone?: string | null,
  isAllDay?: boolean | null
): string {
  const zone = localeZone(timeZone);
  const dateStr = instant.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...zone,
  });
  if (isAllDay) return dateStr;
  return `${dateStr} at ${formatZonedClock(instant, timeZone)}`;
}

export function formatShareWhenRange(
  start: Date,
  end: Date,
  timeZone?: string | null,
  isAllDay?: boolean | null
): string {
  const zone = localeZone(timeZone);
  const startDay = start.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', ...zone });
  const endDay = end.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', ...zone });
  const startLabel = formatShareInstant(start, timeZone, isAllDay);
  if (startDay === endDay) {
    if (isAllDay) return startLabel;
    return `${startLabel} – ${formatZonedClock(end, timeZone)}`;
  }
  return `${startLabel} – ${formatShareInstant(end, timeZone, isAllDay)}`;
}

export function newEventNotificationBody(
  name: string,
  start: Date,
  timeZone?: string | null,
  isAllDay?: boolean | null
): string {
  return `${name} on ${formatNotificationEventWhen(start, timeZone, isAllDay)}`;
}

export function eventTimeUpdatedNotificationBody(
  name: string,
  start: Date,
  timeZone?: string | null,
  isAllDay?: boolean | null
): string {
  return `"${name}" is now ${formatNotificationEventWhen(start, timeZone, isAllDay)}`;
}

export function timeSuggestionNotificationBody(
  suggesterName: string,
  start: Date,
  eventName: string,
  timeZone?: string | null
): string {
  return `${suggesterName} suggested ${formatNotificationEventWhen(start, timeZone, false)} for "${eventName}"`;
}
