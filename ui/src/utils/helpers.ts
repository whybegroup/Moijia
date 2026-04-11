// ── Date formatting ───────────────────────────────────────────────────────────
// Event/API instants are UTC ISO strings (`…Z`). `formatLocalDateInput` / `fmtTime` interpret in the
// system timezone. For explicit naming, see `utils/datetimeUtc.ts`.

/** Local calendar `YYYY-MM-DD` from a `Date` or from a UTC ISO string (displays in system TZ). */
export function formatLocalDateInput(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Same as {@link formatLocalDateInput} but with `/` separators (e.g. `2026/04/11`). */
export function formatLocalDateYmdSlashes(d: Date | string): string {
  return formatLocalDateInput(d).replace(/-/g, '/');
}

const DAYS_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_FULL   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS_S    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_F    = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function fmtTime(d: Date): string {
  let h = d.getHours(), m = d.getMinutes();
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2,'0')} ${ap}`;
}

export function fmtDateFull(d: Date): string {
  return `${DAYS_FULL[d.getDay()]}, ${MONTHS_F[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtDateShort(d: Date): string {
  return `${MONTHS_S[d.getMonth()]} ${d.getDate()}`;
}

export function fmtMonthShort(d: Date): string {
  return MONTHS_S[d.getMonth()].toUpperCase();
}

export function fmtMonthFull(d: Date): string {
  return MONTHS_F[d.getMonth()];
}

export function dayShort(d: Date): string { return DAYS_SHORT[d.getDay()]; }
export function dayFull(d: Date): string  { return DAYS_FULL[d.getDay()]; }

export function dDiff(d: Date): number {
  return Math.ceil(
    (new Date(d.toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000
  );
}

export function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function timeAgo(d: Date): string {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

// ── Color helpers ────────────────────────────────────────────────────────────
/** Convert HSL to hex. h 0–360, s and l 0–100. */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const x = a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round((l - x) * 255);
  };
  const r = f(0), g = f(8), b = f(4);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Parse input to #RRGGBB or null if invalid. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([a-f\d]{6})$/i.exec((input || '').trim());
  return m ? '#' + m[1].toLowerCase() : null;
}

// ── Group theme from name (when user-specific color not set) ──────────────────
/** Hash group name to a hue and return a stable hex color (any hue, fixed saturation/lightness). */
export function getDefaultGroupThemeFromName(groupName: string): string {
  const hash = [...(groupName || '')].reduce((acc, c) => acc + c.charCodeAt(0) * 31, 0);
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 65, 55);
}

// ── Group helpers ─────────────────────────────────────────────────────────────
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/** Border radius for group avatar wrapper - matches My Groups (12 for 44px). */
export function groupAvatarBorderRadius(size: number): number {
  return Math.round(size * 12 / 44);
}

export function getGroupColor(colorHex?: string) {
  const hex = colorHex || '#EC4899';
  const rgb = hexToRgb(hex);
  
  if (!rgb) return {
    dot: hex,
    cal: hex,
    row: `${hex}10`,
    label: `${hex}20`,
    text: hex,
  };
  
  return {
    dot: hex,
    cal: hex,
    row: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`,
    label: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
    text: hex,
  };
}

// ── Avatar color ──────────────────────────────────────────────────────────────
export function avatarColor(name: string): string {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0) * 41, 0) % 360;
  return `hsl(${hue}, 45%, 58%)`;
}

// ── Unique ID ─────────────────────────────────────────────────────────────────
export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Days in month ─────────────────────────────────────────────────────────────
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ── RSVP / waitlist ─────────────────────────────────────────────────────────
type RsvpForWaitlistOrder = { userId: string; status: string; createdAt: string };

/** 1-based queue position; order matches server waitlist promotion (FIFO by createdAt). */
export function getMyWaitlistPosition(
  rsvps: RsvpForWaitlistOrder[] | undefined,
  meId: string | undefined,
): number | null {
  if (!meId || !rsvps?.length) return null;
  const waitlisted = rsvps.filter((r) => r.status === 'waitlist');
  if (!waitlisted.some((r) => r.userId === meId)) return null;
  const t = (r: RsvpForWaitlistOrder) => {
    const ms = new Date(r.createdAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };
  const sorted = [...waitlisted].sort((a, b) => {
    const d = t(a) - t(b);
    if (d !== 0) return d;
    return a.userId.localeCompare(b.userId);
  });
  const idx = sorted.findIndex((r) => r.userId === meId);
  return idx >= 0 ? idx + 1 : null;
}
