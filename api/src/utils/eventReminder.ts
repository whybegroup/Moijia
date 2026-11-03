import type { NotifPrefsPartial } from '../models/NotifPrefs';
import { DEFAULT_NOTIF_PREFS, mergeNotifPrefs, parseNotifPrefsJson } from './notifPrefsCore';

const HOUR_MS = 60 * 60 * 1000;

/** Lead time before the event start. `Never` is not a lead. */
export const EVENT_REMINDER_LEADS_MS: Record<string, number> = {
  '1 hour before': HOUR_MS,
  '1 day before': 24 * HOUR_MS,
  '1 week before': 7 * 24 * HOUR_MS,
};

const CUSTOM_KEY = 'eventReminderCustomized';

type StoredPrefs = {
  eventReminder?: unknown;
  eventReminderCustomized?: unknown;
};

function readStored(raw: string | null | undefined): StoredPrefs | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPrefs;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Group reminder that should replace the profile default.
 * A saved "1 hour before" is the default dump from other toggles unless the member picked it.
 */
export function groupReminderOverride(raw: string | null | undefined): string | undefined {
  const stored = readStored(raw);
  if (!stored || typeof stored.eventReminder !== 'string') return undefined;
  if (stored.eventReminderCustomized === true) return stored.eventReminder;
  if (stored.eventReminder === 'Never') return 'Never';
  if (
    stored.eventReminder !== DEFAULT_NOTIF_PREFS.eventReminder &&
    stored.eventReminder in EVENT_REMINDER_LEADS_MS
  ) {
    return stored.eventReminder;
  }
  return undefined;
}

/** Chip shown for a group: the member's override, otherwise their profile reminder. */
export function displayedGroupEventReminder(
  globalRaw: string | null | undefined,
  groupRaw: string | null | undefined
): string {
  return groupReminderOverride(groupRaw) ?? parseNotifPrefsJson(globalRaw).eventReminder;
}

/**
 * Milliseconds before start to send, or null when reminders are off.
 * Profile "Never" turns reminders off. A group override replaces the profile lead,
 * and group "Never" turns them off for that group.
 */
export function effectiveEventReminderLeadMs(
  globalRaw: string | null | undefined,
  groupRaw: string | null | undefined
): number | null {
  const globalChoice = parseNotifPrefsJson(globalRaw).eventReminder;
  if (globalChoice === 'Never') return null;
  const selected = groupReminderOverride(groupRaw) ?? globalChoice;
  if (selected === 'Never') return null;
  return EVENT_REMINDER_LEADS_MS[selected] ?? null;
}

export function eventReminderNotificationId(eventId: string, userId: string, start: Date): string {
  return `evtrem_${eventId}_${userId}_${start.getTime()}`;
}

/** Keep the customized flag when other group toggles are saved. */
export function persistMemberNotifPrefs(
  existingRaw: string | null | undefined,
  patch: NotifPrefsPartial
): string {
  const setsReminder = Object.prototype.hasOwnProperty.call(patch, 'eventReminder');
  const customized = readStored(existingRaw)?.[CUSTOM_KEY] === true || setsReminder;
  const merged = mergeNotifPrefs(parseNotifPrefsJson(existingRaw), patch);
  if (!customized) return JSON.stringify(merged);
  return JSON.stringify({ ...merged, [CUSTOM_KEY]: true });
}
