import type { NotifPrefs, NotifPrefsPartial } from '../models/NotifPrefs';

export type NotifPrefsKey = keyof Omit<NotifPrefs, 'eventReminder'>;

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  newEvent: true,
  minAttendees: true,
  onLocation: true,
  onTime: true,
  onRsvp: true,
  comments: true,
  mentions: true,
  groupMembership: true,
  eventReminder: '1 hour before',
};

export function parseNotifPrefsJson(raw: string | null | undefined): NotifPrefs {
  if (!raw) return { ...DEFAULT_NOTIF_PREFS };
  try {
    const o = JSON.parse(raw) as NotifPrefsPartial;
    return { ...DEFAULT_NOTIF_PREFS, ...o };
  } catch {
    return { ...DEFAULT_NOTIF_PREFS };
  }
}

export function mergeNotifPrefs(base: NotifPrefs, patch: NotifPrefsPartial): NotifPrefs {
  return { ...base, ...patch };
}

export function notifTypeToPrefKey(type: string | undefined): NotifPrefsKey | null {
  switch (type) {
    case 'event_created':
      return 'newEvent';
    case 'rsvp':
      return 'onRsvp';
    case 'comment':
      return 'comments';
    case 'mention':
      return 'mentions';
    case 'waitlist_promotion':
      return 'minAttendees';
    case 'time_suggestion':
    case 'event_time_changed':
      return 'onTime';
    case 'group_approval':
      return 'groupMembership';
    case 'location_changed':
      return 'onLocation';
    default:
      return null;
  }
}
