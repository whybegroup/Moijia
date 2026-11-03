const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const timeZone = raw.trim();
  if (!timeZone || timeZone.length > 120) return null;
  return isValidIanaTimeZone(timeZone) ? timeZone : null;
}

type ZonedParts = {
  month: number;
  day: number;
  year: number;
  hour24: number;
  minute: number;
  zoneName: string;
};

function zoneOrUtc(timeZone?: string | null): string {
  const tz = timeZone?.trim();
  if (tz && isValidIanaTimeZone(tz)) return tz;
  return 'UTC';
}

/** Wall-clock parts in an IANA zone. Hour 0 is midnight and hour 12 is noon. */
export function zonedParts(date: Date, timeZone?: string | null): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zoneOrUtc(timeZone),
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
  const map = new Map(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  let hour24 = Number(map.get('hour'));
  if (hour24 === 24) hour24 = 0;
  return {
    month: Number(map.get('month')),
    day: Number(map.get('day')),
    year: Number(map.get('year')),
    hour24,
    minute: Number(map.get('minute')),
    zoneName: map.get('timeZoneName') ?? '',
  };
}

export function formatZonedClock(date: Date, timeZone?: string | null): string {
  const parts = zonedParts(date, timeZone);
  const suffix = parts.hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = parts.hour24 % 12 || 12;
  return `${hour12}:${String(parts.minute).padStart(2, '0')} ${suffix}`;
}

function monthDay(parts: ZonedParts): string {
  return `${MONTHS[parts.month - 1] ?? ''} ${parts.day}`;
}

function withZone(clock: string, parts: ZonedParts): string {
  return parts.zoneName ? `${clock} (${parts.zoneName})` : clock;
}

/** Date, and a 12-hour clock when the instant is within 48 hours. */
export function formatInstantInTimeZone(date: Date, timeZone?: string | null): string {
  const parts = zonedParts(date, timeZone);
  const soon = Math.abs(date.getTime() - Date.now()) < 48 * 60 * 60 * 1000;
  if (!soon) return `${monthDay(parts)}, ${parts.year}`;
  return `${monthDay(parts)}, ${withZone(formatZonedClock(date, timeZone), parts)}`;
}

export function formatEventWhen(date: Date, timeZone?: string | null, isAllDay?: boolean | null): string {
  const parts = zonedParts(date, timeZone);
  const day = monthDay(parts);
  if (isAllDay) return day;
  return `${day} at ${withZone(formatZonedClock(date, timeZone), parts)}`;
}
