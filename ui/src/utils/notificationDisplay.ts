import { formatPlanDate, formatZonedTimestamp } from './groupPlanPeriod';

/**
 * Heading shown in notification lists. Mention alerts always use this copy
 * so the title stays correct even if older rows used a different title.
 */
export function notificationListTitle(n: {
  title: string;
  type?: string | null;
  icon?: string | null;
  body?: string | null;
}): string {
  const t = (n.type ?? '').trim().toLowerCase();
  if (t === 'mention') return 'You were mentioned';
  const body = (n.body ?? '').toLowerCase();
  if (body.includes('mentioned you in a comment')) return 'You were mentioned';
  return n.title;
}

/** UTC instants left in notification copy, shown in the profile time zone. */
export function formatNotificationBody(body: string): string {
  return body.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z/g,
    (iso) => formatPlanDate(iso) || iso
  );
}

/** Arrival time in the profile time zone, or the device zone until one is saved. */
export function formatNotificationTimestamp(value: string | Date | number): string {
  return formatZonedTimestamp(value);
}
