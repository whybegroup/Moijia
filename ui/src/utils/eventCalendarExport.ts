import { Linking, Platform, Share } from 'react-native';
import * as Calendar from 'expo-calendar';
import { File, Paths } from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import Toast from 'react-native-toast-message';
import { requestPermissionPrompt } from './permissions';
import { eventLocationShareLabel, stripHtmlToText } from './sharePreviewCopy';
import { eventShareLink, withShareTimeZone } from './shareLinks';

export type EventCalendarDetails = {
  name: string;
  start: Date | string;
  end?: Date | string | null;
  isAllDay?: boolean | null;
  location?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  description?: string | null;
  groupName?: string | null;
  recurrenceRule?: string | null;
  recurrenceSeriesId?: string | null;
  /** Last remaining occurrence (end of local day) when exporting a repeating series. */
  recurrenceEndsAt?: Date | string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function icsUtcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

function icsLocalDate(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function nextLocalDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

const RFC_BYDAY_TO_EXPO: Record<string, number> = {
  SU: Calendar.DayOfTheWeek.Sunday,
  MO: Calendar.DayOfTheWeek.Monday,
  TU: Calendar.DayOfTheWeek.Tuesday,
  WE: Calendar.DayOfTheWeek.Wednesday,
  TH: Calendar.DayOfTheWeek.Thursday,
  FR: Calendar.DayOfTheWeek.Friday,
  SA: Calendar.DayOfTheWeek.Saturday,
};

const THREE_LETTER_BYDAY_TO_RFC: Record<string, string> = {
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
  if (u in RFC_BYDAY_TO_EXPO) return u;
  return THREE_LETTER_BYDAY_TO_RFC[u] ?? u;
}

function normalizeBydayCsvToken(tok: string): string {
  const t = tok.trim();
  const m = t.match(/^([+-]?\d+)([A-Za-z]+)$/);
  if (m) return m[1] + weekdayLettersToRfc(m[2]);
  return weekdayLettersToRfc(t);
}

export function normalizeIcsRrule(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const body = t.toUpperCase().startsWith('RRULE:') ? t.slice(6).trim() : t;
  const normalized = body.replace(/\bBYDAY=([^;]+)/gi, (_m, csv: string) => {
    const parts = csv.split(',').map((x: string) => normalizeBydayCsvToken(x)).join(',');
    return `BYDAY=${parts}`;
  });
  return normalized || null;
}

function parseRruleParts(rule: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of rule.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    o[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim();
  }
  return o;
}

function parseIcsUntil(raw: string): Date | null {
  const t = raw.trim();
  if (/^\d{8}T\d{6}Z$/i.test(t)) {
    return new Date(
      `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`,
    );
  }
  if (/^\d{8}T\d{6}$/i.test(t)) {
    const local = new Date(
      Number(t.slice(0, 4)),
      Number(t.slice(4, 6)) - 1,
      Number(t.slice(6, 8)),
      Number(t.slice(9, 11)),
      Number(t.slice(11, 13)),
      Number(t.slice(13, 15)),
    );
    return Number.isNaN(local.getTime()) ? null : local;
  }
  if (/^\d{8}$/.test(t)) {
    return new Date(Number(t.slice(0, 4)), Number(t.slice(4, 6)) - 1, Number(t.slice(6, 8)), 23, 59, 59, 999);
  }
  return null;
}

function expoFrequency(freq: string): Calendar.Frequency | null {
  switch (freq.toUpperCase()) {
    case 'DAILY':
      return Calendar.Frequency.DAILY;
    case 'WEEKLY':
      return Calendar.Frequency.WEEKLY;
    case 'MONTHLY':
      return Calendar.Frequency.MONTHLY;
    case 'YEARLY':
      return Calendar.Frequency.YEARLY;
    default:
      return null;
  }
}

function parseBydayTokens(csv: string): Calendar.DaysOfTheWeek[] {
  const out: Calendar.DaysOfTheWeek[] = [];
  for (const tok of csv.split(',')) {
    const t = tok.trim().toUpperCase();
    const m = t.match(/^([+-]?\d+)?([A-Z]{2})$/);
    if (!m) continue;
    const dayOfTheWeek = RFC_BYDAY_TO_EXPO[m[2]];
    if (!dayOfTheWeek) continue;
    const weekNumber = m[1] ? parseInt(m[1], 10) : undefined;
    out.push(
      Number.isFinite(weekNumber) && weekNumber
        ? { dayOfTheWeek, weekNumber }
        : { dayOfTheWeek },
    );
  }
  return out;
}

function expoRecurrenceRule(raw: string | null | undefined): Calendar.RecurrenceRule | null {
  const rule = normalizeIcsRrule(raw);
  if (!rule) return null;
  const p = parseRruleParts(rule);
  const frequency = expoFrequency(p.FREQ || '');
  if (!frequency) return null;
  const parsed: Calendar.RecurrenceRule = { frequency };
  const interval = parseInt(p.INTERVAL || '1', 10);
  if (Number.isFinite(interval) && interval > 1) parsed.interval = interval;
  const count = parseInt(p.COUNT || '', 10);
  if (Number.isFinite(count) && count > 0) parsed.occurrence = count;
  if (p.UNTIL) {
    const until = parseIcsUntil(p.UNTIL);
    if (until) parsed.endDate = until;
  }
  if (p.BYDAY) {
    const days = parseBydayTokens(p.BYDAY);
    if (days.length) parsed.daysOfTheWeek = days;
  }
  if (p.BYMONTHDAY) {
    const days = p.BYMONTHDAY.split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (days.length) parsed.daysOfTheMonth = days;
  }
  if (p.BYMONTH) {
    const months = p.BYMONTH.split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => n >= 1 && n <= 12) as Calendar.MonthOfTheYear[];
    if (months.length) parsed.monthsOfTheYear = months;
  }
  return parsed;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcsLine(line: string): string {
  const max = 73;
  if (line.length <= max) return line;
  const parts: string[] = [line.slice(0, max)];
  let rest = line.slice(max);
  while (rest.length) {
    parts.push(` ${rest.slice(0, max - 1)}`);
    rest = rest.slice(max - 1);
  }
  return parts.join('\r\n');
}

function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export function eventIcsFileName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'event'}.ics`;
}

function eventPageUrl(eventId: string): string {
  return withShareTimeZone(eventShareLink(eventId));
}

function calendarDescription(details: EventCalendarDetails, url: string): string {
  const desc = stripHtmlToText(details.description ?? '');
  const group = (details.groupName ?? '').trim();
  const parts = [desc, group ? `In ${group}` : '', url].filter(Boolean);
  return parts.join('\n\n');
}

function timedRange(details: EventCalendarDetails): { start: Date; end: Date; isAllDay: boolean } {
  const start = toDate(details.start) ?? new Date();
  let end = toDate(details.end) ?? start;
  const isAllDay = !!details.isAllDay;
  if (!isAllDay && end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  return { start, end, isAllDay };
}

export type CalendarExportScope = 'this' | 'future';

export function isRepeatingCalendarEvent(details: EventCalendarDetails): boolean {
  return !!normalizeIcsRrule(details.recurrenceRule);
}

function icsUntilFromLocalDay(d: Date): string {
  const localEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return localEnd.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function rruleForRemaining(
  raw: string | null | undefined,
  remainingStarts: Date[],
): string | null {
  if (remainingStarts.length <= 1) return null;
  const rule = normalizeIcsRrule(raw);
  if (!rule) return null;
  const parts = parseRruleParts(rule);
  const kept = rule.split(';').filter((part) => {
    const key = part.split('=')[0]?.trim().toUpperCase();
    return key !== 'COUNT' && key !== 'UNTIL';
  });
  const last = remainingStarts[remainingStarts.length - 1]!;
  if (parts.UNTIL) {
    kept.push(`UNTIL=${icsUntilFromLocalDay(last)}`);
  } else {
    kept.push(`COUNT=${remainingStarts.length}`);
  }
  return kept.join(';');
}

export function detailsForCalendarExportScope(
  details: EventCalendarDetails,
  scope: CalendarExportScope,
  seriesStarts: Date[],
): EventCalendarDetails {
  const { start, end } = timedRange(details);
  const currentMs = start.getTime();
  const starts = [...seriesStarts]
    .map((d) => toDate(d))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!starts.some((d) => Math.abs(d.getTime() - currentMs) <= 1000)) {
    starts.push(start);
    starts.sort((a, b) => a.getTime() - b.getTime());
  }

  if (scope === 'this') {
    return { ...details, recurrenceRule: null, recurrenceSeriesId: null };
  }

  const fromHere = starts.filter((d) => d.getTime() >= currentMs - 1000);
  if (fromHere.length <= 1) {
    return { ...details, start, end };
  }
  const last = fromHere[fromHere.length - 1]!;
  return {
    ...details,
    start,
    end,
    recurrenceRule: rruleForRemaining(details.recurrenceRule, fromHere),
    recurrenceEndsAt: new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999),
  };
}

export function buildEventIcs(eventId: string, details: EventCalendarDetails): string {
  const { start, end, isAllDay } = timedRange(details);
  const url = eventPageUrl(eventId);
  const summary = details.name.trim() || 'Event';
  const location = eventLocationShareLabel(details);
  const description = calendarDescription(details, url);
  const seriesId = (details.recurrenceSeriesId ?? '').trim();
  const rrule = normalizeIcsRrule(details.recurrenceRule);
  const uid = rrule && seriesId
    ? `moijia-series-${seriesId}@moijia.com`
    : `moijia-event-${eventId.trim()}@moijia.com`;
  const now = new Date();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Moijia//Event Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsUtcStamp(now)}`,
    isAllDay
      ? `DTSTART;VALUE=DATE:${icsLocalDate(start)}`
      : `DTSTART:${icsUtcStamp(start)}`,
    isAllDay
      ? `DTEND;VALUE=DATE:${icsLocalDate(nextLocalDate(end))}`
      : `DTEND:${icsUtcStamp(end)}`,
    rrule ? foldIcsLine(`RRULE:${rrule}`) : null,
    foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
    description ? foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`) : null,
    location ? foldIcsLine(`LOCATION:${escapeIcsText(location)}`) : null,
    foldIcsLine(`URL:${url}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => line != null);

  return `${lines.join('\r\n')}\r\n`;
}

export function googleCalendarTemplateUrl(eventId: string, details: EventCalendarDetails): string {
  const { start, end, isAllDay } = timedRange(details);
  const url = eventPageUrl(eventId);
  const dates = isAllDay
    ? `${icsLocalDate(start)}/${icsLocalDate(nextLocalDate(end))}`
    : `${icsUtcStamp(start)}/${icsUtcStamp(end)}`;
  
  let finalUrl = 'https://calendar.google.com/calendar/render';
  finalUrl += '?action=TEMPLATE';
  finalUrl += `&text=${encodeURIComponent(details.name.trim() || 'Event')}`;
  finalUrl += `&dates=${dates}`;
  finalUrl += `&details=${encodeURIComponent(calendarDescription(details, url).slice(0, 8000))}`;
  
  const location = eventLocationShareLabel(details);
  if (location) {
    finalUrl += `&location=${encodeURIComponent(location)}`;
  }
  
  const rrule = normalizeIcsRrule(details.recurrenceRule);
  if (rrule) {
    finalUrl += `&recur=${encodeURIComponent('RRULE:' + rrule)}`;
  }
  
  const tz = viewerTimeZone();
  if (tz) {
    finalUrl += `&ctz=${encodeURIComponent(tz)}`;
  }
  
  return finalUrl;
}

function isShareCanceled(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const name = 'name' in e ? String((e as { name?: string }).name ?? '') : '';
  if (name === 'AbortError') return true;
  const msg = 'message' in e ? String((e as { message?: string }).message ?? '') : '';
  return /cancel|dismiss/i.test(msg);
}

function downloadIcsOnWeb(ics: string, filename: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function calendarEventDialogPayload(eventId: string, details: EventCalendarDetails) {
  const { start, end, isAllDay } = timedRange(details);
  const url = eventPageUrl(eventId);
  const startDate = isAllDay
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate())
    : start;
  const eventEndDate = isAllDay ? nextLocalDate(end) : end;
  const recurrenceRule = expoRecurrenceRule(details.recurrenceRule);
  const seriesEnd = toDate(details.recurrenceEndsAt);
  if (recurrenceRule && seriesEnd && !recurrenceRule.endDate) {
    recurrenceRule.endDate = seriesEnd;
  }
  return {
    title: details.name.trim() || 'Event',
    startDate,
    endDate: eventEndDate,
    allDay: isAllDay,
    location: eventLocationShareLabel(details) || undefined,
    notes: calendarDescription(details, url),
    url,
    timeZone: viewerTimeZone() || undefined,
    ...(recurrenceRule ? { recurrenceRule } : {}),
  };
}

async function presentSystemCalendarComposer(
  eventId: string,
  details: EventCalendarDetails,
): Promise<boolean> {
  const allowed = await requestPermissionPrompt(
    () => Calendar.getCalendarPermissionsAsync(),
    () => Calendar.requestCalendarPermissionsAsync(),
    {
      title: 'Calendar',
      message: 'Allow calendar access in Settings to add this event.',
    },
  );
  if (!allowed) return false;
  const payload = calendarEventDialogPayload(eventId, details);
  await Calendar.createEventInCalendarAsync(payload);
  return true;
}

async function writeIcsCacheFile(ics: string, filename: string): Promise<string> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await Promise.resolve(file.write(ics));
  return file.uri;
}

async function shareIcsFile(localUri: string, filename: string, title: string): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      await Share.share({ url: localUri, title });
      return;
    }
    await Share.share({
      title,
      url: localUri,
      message: filename,
    });
  } catch (e: unknown) {
    if (isShareCanceled(e)) return;
    throw e;
  }
}

export async function openEventInGoogleCalendar(
  eventId: string,
  details: EventCalendarDetails,
): Promise<void> {
  const url = googleCalendarTemplateUrl(eventId, details);
  console.log('Google Calendar URL:', url);
  console.log('Recurrence rule:', details.recurrenceRule);
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.assign(url);
      return;
    }
    await Linking.openURL(url);
  } catch (e) {
    console.error('Google Calendar error:', e);
    Toast.show({ type: 'error', text1: 'Could not open Google Calendar' });
  }
}

export async function saveEventCalendarFile(
  eventId: string,
  details: EventCalendarDetails,
): Promise<void> {
  const ics = buildEventIcs(eventId, details);
  const filename = eventIcsFileName(details.name);
  try {
    if (Platform.OS === 'web') {
      downloadIcsOnWeb(ics, filename);
      return;
    }
    const uri = await writeIcsCacheFile(ics, filename);
    await shareIcsFile(uri, filename, 'Save calendar file');
  } catch (e: unknown) {
    if (isShareCanceled(e)) return;
    Toast.show({
      type: 'error',
      text1: 'Could not save calendar file',
      text2: 'Please try again.',
    });
  }
}

export async function addEventToDeviceCalendar(
  eventId: string,
  details: EventCalendarDetails,
): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      downloadIcsOnWeb(buildEventIcs(eventId, details), eventIcsFileName(details.name));
      return;
    }
    const added = await presentSystemCalendarComposer(eventId, details);
    if (!added) return;
  } catch (e: unknown) {
    if (isShareCanceled(e)) return;
    try {
      const ics = buildEventIcs(eventId, details);
      const filename = eventIcsFileName(details.name);
      const uri = await writeIcsCacheFile(ics, filename);
      await shareIcsFile(uri, filename, 'Add to calendar');
    } catch (fallbackErr: unknown) {
      if (isShareCanceled(fallbackErr)) return;
      Toast.show({
        type: 'error',
        text1: 'Could not add to calendar',
        text2: 'Please try again.',
      });
    }
  }
}
