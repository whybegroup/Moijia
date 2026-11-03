const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let displayTimeZone: string | null = null;

/** Saved profile zone. Date formatters read this during render. */
export function setDisplayTimeZone(timeZone: string | null | undefined) {
  displayTimeZone = timeZone?.trim() || null;
}

export function displayTimeZoneOrDevice(): string | undefined {
  if (displayTimeZone) return displayTimeZone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

type ZonedParts = {
  month: number;
  day: number;
  year: number;
  hour24: number;
  minute: number;
  zoneName: string;
};

function zonedParts(date: Date, timeZone: string): ZonedParts | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
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
    if (!Number.isFinite(hour24)) return null;
    return {
      month: Number(map.get('month')),
      day: Number(map.get('day')),
      year: Number(map.get('year')),
      hour24,
      minute: Number(map.get('minute')),
      zoneName: map.get('timeZoneName') ?? '',
    };
  } catch {
    return null;
  }
}

function clock(hour24: number, minute: number): string {
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatParts(date: Date, parts: ZonedParts, alwaysTime: boolean): string {
  const day = `${MONTHS[parts.month - 1] ?? ''} ${parts.day}`;
  const soon = alwaysTime || Math.abs(date.getTime() - Date.now()) < 48 * 60 * 60 * 1000;
  if (!soon) return `${day}, ${parts.year}`;
  const time = clock(parts.hour24, parts.minute);
  const zoned = parts.zoneName ? `${time} (${parts.zoneName})` : time;
  return alwaysTime ? `${day}, ${zoned}` : `${day}, ${zoned}`;
}

/** Profile time zone when one is saved, otherwise the device zone. */
export function formatPlanDate(raw: Date | string, timeZone?: string | null): string {
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const zone = timeZone?.trim() || displayTimeZoneOrDevice();
  const parts = zone ? zonedParts(date, zone) : null;
  if (!parts || !Number.isFinite(parts.month)) return '';
  return formatParts(date, parts, false);
}

/** Notification arrival time, always with a clock. */
export function formatZonedTimestamp(raw: Date | string | number, timeZone?: string | null): string {
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const zone = timeZone?.trim() || displayTimeZoneOrDevice();
  const parts = zone ? zonedParts(date, zone) : null;
  if (!parts || !Number.isFinite(parts.month)) return '';
  return formatParts(date, parts, true);
}
