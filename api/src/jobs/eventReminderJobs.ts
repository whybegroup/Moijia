import { Prisma, PrismaClient } from '@prisma/client';
import { NotificationService } from '../services/NotificationService';
import { eventReminderNotificationBody } from '../utils/formatNotificationEventWhen';
import {
  effectiveEventReminderLeadMs,
  eventReminderNotificationId,
  EVENT_REMINDER_LEADS_MS,
} from '../utils/eventReminder';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

/** Longest lead, so every due reminder is inside this window. */
const HORIZON_MS = Math.max(...Object.values(EVENT_REMINDER_LEADS_MS));
const INTERVAL_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function isUniqueConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Going RSVPs watch the event unless they turn that off. */
function wantsReminder(rsvpStatus: string | undefined, explicitWatch: boolean | undefined): boolean {
  if (rsvpStatus !== 'going') return false;
  return explicitWatch !== false;
}

/**
 * Send event reminders that are due. Push goes out with the in-app notification,
 * so this reaches devices while the app is closed.
 */
export async function sendDueEventReminders(now = new Date()): Promise<void> {
  const horizon = new Date(now.getTime() + HORIZON_MS);
  const events = await prisma.event.findMany({
    where: {
      start: { gt: now, lte: horizon },
      group: { deletedAt: null },
    },
    select: {
      id: true,
      name: true,
      start: true,
      isAllDay: true,
      groupId: true,
      rsvps: { select: { userId: true, status: true } },
      watches: { select: { userId: true, watching: true } },
    },
  });
  if (events.length === 0) return;

  const groupIds = [...new Set(events.map((event) => event.groupId))];
  const members = await prisma.groupMember.findMany({
    where: { groupId: { in: groupIds }, status: 'active' },
    select: {
      groupId: true,
      userId: true,
      notifPrefsJson: true,
      user: { select: { notifPrefsJson: true, timeZone: true } },
    },
  });
  const membersByGroup = new Map<string, typeof members>();
  for (const member of members) {
    const list = membersByGroup.get(member.groupId) ?? [];
    list.push(member);
    membersByGroup.set(member.groupId, list);
  }

  type Due = {
    id: string;
    userId: string;
    body: string;
    eventId: string;
    groupId: string;
  };
  const due: Due[] = [];

  for (const event of events) {
    const rsvpByUser = new Map(event.rsvps.map((rsvp) => [rsvp.userId, rsvp.status]));
    const watchByUser = new Map(event.watches.map((watch) => [watch.userId, watch.watching]));
    for (const member of membersByGroup.get(event.groupId) ?? []) {
      if (!wantsReminder(rsvpByUser.get(member.userId), watchByUser.get(member.userId))) {
        continue;
      }
      const leadMs = effectiveEventReminderLeadMs(member.user.notifPrefsJson, member.notifPrefsJson);
      if (leadMs == null) continue;
      if (now.getTime() < event.start.getTime() - leadMs) continue;
      due.push({
        id: eventReminderNotificationId(event.id, member.userId, event.start),
        userId: member.userId,
        body: eventReminderNotificationBody(event.name, event.start, member.user.timeZone, event.isAllDay),
        eventId: event.id,
        groupId: event.groupId,
      });
    }
  }
  if (due.length === 0) return;

  const already = new Set<string>();
  for (let i = 0; i < due.length; i += 400) {
    const ids = due.slice(i, i + 400).map((item) => item.id);
    const rows = await prisma.notification.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    for (const row of rows) already.add(row.id);
  }

  let sent = 0;
  for (const item of due) {
    if (already.has(item.id)) continue;
    try {
      await notificationService.create({
        id: item.id,
        userId: item.userId,
        type: 'event_reminder',
        icon: 'alarm-outline',
        title: 'Event reminder',
        body: item.body,
        read: false,
        eventId: item.eventId,
        groupId: item.groupId,
        dest: 'event',
        navigable: true,
      });
      sent += 1;
    } catch (err) {
      if (!isUniqueConflict(err)) throw err;
    }
  }
  if (sent > 0) console.log(`[event-reminder] sent ${sent}`);
}

export function startEventReminderJobs(): void {
  if (timer) return;
  const run = () => {
    if (running) return;
    running = true;
    void sendDueEventReminders()
      .catch((err) => {
        console.error('[event-reminder]', err);
      })
      .finally(() => {
        running = false;
      });
  };
  run();
  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
}
