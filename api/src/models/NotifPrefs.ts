/**
 * Global and per-group in-app notification preferences.
 * Delivery rule: global[key] && group[key] (when group applies).
 */
export interface NotifPrefs {
  newEvent: boolean;
  minAttendees: boolean;
  onLocation: boolean;
  onTime: boolean;
  onRsvp: boolean;
  comments: boolean;
  mentions: boolean;
  groupMembership: boolean;
  eventReminder: string;
}

export type NotifPrefsPartial = Partial<NotifPrefs>;
