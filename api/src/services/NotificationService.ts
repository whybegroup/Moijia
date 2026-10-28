import { PrismaClient } from '@prisma/client';
import { Notification, NotificationInput } from '../models';
import { notifTypeToPrefKey, parseNotifPrefsJson } from '../utils/notifPrefsCore';
import { PushNotificationService } from './PushNotificationService';
import {
  eventTimeUpdatedNotificationBody,
  newEventNotificationBody,
  timeSuggestionNotificationBody,
} from '../utils/formatNotificationEventWhen';

const prisma = new PrismaClient();
const pushNotificationService = new PushNotificationService();

export class NotificationService {
  /**
   * Get all notifications with optional user filtering.
   * `timeZone` is an IANA zone from the device (`Intl…timeZone`) so event times in
   * notification bodies match the rest of the app.
   */
  public async getAll(userId?: string, timeZone?: string): Promise<Notification[]> {
    const notifications = await prisma.notification.findMany({
      where: userId ? { userId } : undefined,
      orderBy: {
        ts: 'desc',
      },
    });
    const mapped = notifications.map((n) => this.mapNotification(n));
    return this.applyViewerTimeZoneToBodies(mapped, timeZone);
  }

  /**
   * Get notification by ID
   */
  public async getById(id: string): Promise<Notification | null> {
    const notification = await prisma.notification.findUnique({
      where: { id },
    });
    return notification ? this.mapNotification(notification) : null;
  }

  /**
   * Create a notification
   */
  public async create(input: NotificationInput): Promise<Notification> {
    const notification = await prisma.notification.create({
      data: {
        ...input,
        read: input.read ?? false,
        ts: input.ts ? new Date(input.ts) : new Date(),
        navigable: input.navigable ?? false,
      },
    });
    const mapped = this.mapNotification(notification);
    if (mapped.userId) {
      void pushNotificationService.sendForNotification(mapped).catch(() => undefined);
    }
    return mapped;
  }

  /**
   * Mark notification as read/unread
   */
  public async updateReadStatus(id: string, read: boolean): Promise<Notification> {
    const notification = await prisma.notification.update({
      where: { id },
      data: { read },
    });
    return this.mapNotification(notification);
  }

  /**
   * Get unread count for a user
   */
  public async getUnreadCount(userId: string): Promise<number> {
    return await prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  public async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
      },
    });
  }

  /**
   * Delete a notification
   */
  public async delete(id: string): Promise<void> {
    await prisma.notification.delete({
      where: { id },
    });
  }

  /**
   * Create notification for a user
   */
  public async createForUser(
    userId: string,
    title: string,
    body: string,
    options?: {
      type?: string;
      icon?: string;
      groupId?: string;
      eventId?: string;
      pollId?: string;
      postId?: string;
      commentId?: string;
      dest?: 'group' | 'event' | 'poll';
    }
  ): Promise<Notification | null> {
    const ok = await this.shouldDeliverNotification(userId, options?.groupId, options?.type);
    if (!ok) return null;
    return this.create({
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      title,
      body,
      type: options?.type || 'general',
      icon: options?.icon || '🔔',
      groupId: options?.groupId,
      eventId: options?.eventId,
      pollId: options?.pollId,
      postId: options?.postId,
      commentId: options?.commentId,
      dest: options?.dest,
      navigable: !!(options?.groupId || options?.eventId || options?.pollId || options?.postId),
    });
  }

  /**
   * Create notification for multiple users
   */
  public async createForUsers(
    userIds: string[],
    title: string,
    body: string,
    options?: {
      type?: string;
      icon?: string;
      groupId?: string;
      eventId?: string;
      pollId?: string;
      postId?: string;
      commentId?: string;
      dest?: 'group' | 'event' | 'poll';
    }
  ): Promise<Notification[]> {
    const notifications = await Promise.all(
      userIds.map((userId) => this.createForUser(userId, title, body, options))
    );
    return notifications.filter((n): n is Notification => n !== null);
  }

  /**
   * Global prefs AND (when groupId set) active member per-group prefs must allow this type.
   */
  private async shouldDeliverNotification(
    userId: string,
    groupId: string | undefined,
    notificationType: string | undefined
  ): Promise<boolean> {
    const key = notifTypeToPrefKey(notificationType);
    if (key === null) return true;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notifPrefsJson: true },
    });
    const globalPrefs = parseNotifPrefsJson(user?.notifPrefsJson);
    if (!globalPrefs[key]) return false;

    if (!groupId) return true;

    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
      select: { status: true, notifPrefsJson: true },
    });
    if (!member || member.status !== 'active') return false;

    const groupPrefs = parseNotifPrefsJson(member.notifPrefsJson);
    return !!groupPrefs[key];
  }

  /**
   * Map Prisma notification to Notification model
   */
  private mapNotification(n: any): Notification {
    return {
      ...n,
      dest: n.dest as 'group' | 'event' | 'poll' | null,
    };
  }

  private async applyViewerTimeZoneToBodies(
    notifications: Notification[],
    timeZone?: string
  ): Promise<Notification[]> {
    const tz = timeZone?.trim();
    if (!tz) return notifications;

    const eventIds = [
      ...new Set(notifications.map((n) => n.eventId).filter((id): id is string => !!id)),
    ];
    if (eventIds.length === 0) return notifications;

    const events = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, name: true, start: true, isAllDay: true },
    });
    const byId = new Map(events.map((e) => [e.id, e]));

    const suggestionNotifs = notifications.filter((n) => n.type === 'time_suggestion' && n.eventId);
    const suggestions = suggestionNotifs.length
      ? await prisma.eventTimeSuggestion.findMany({
          where: { eventId: { in: [...new Set(suggestionNotifs.map((n) => n.eventId as string))] } },
          select: { eventId: true, start: true, createdAt: true, suggestedBy: true },
        })
      : [];
    const suggesterIds = [...new Set(suggestions.map((s) => s.suggestedBy))];
    const suggesters = suggesterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: suggesterIds } },
          select: { id: true, displayName: true },
        })
      : [];
    const nameById = new Map(suggesters.map((u) => [u.id, u.displayName]));

    return notifications.map((n) => {
      const ev = n.eventId ? byId.get(n.eventId) : undefined;
      if (!ev) return n;
      if (n.type === 'event_created') {
        return { ...n, body: newEventNotificationBody(ev.name, ev.start, tz, ev.isAllDay) };
      }
      if (n.type === 'event_time_changed') {
        return { ...n, body: eventTimeUpdatedNotificationBody(ev.name, ev.start, tz, ev.isAllDay) };
      }
      if (n.type === 'time_suggestion') {
        const notifTs = new Date(n.ts).getTime();
        const match = suggestions
          .filter((s) => s.eventId === n.eventId)
          .sort(
            (a, b) =>
              Math.abs(a.createdAt.getTime() - notifTs) - Math.abs(b.createdAt.getTime() - notifTs)
          )[0];
        if (!match) return n;
        const who = nameById.get(match.suggestedBy) || 'Someone';
        return { ...n, body: timeSuggestionNotificationBody(who, match.start, ev.name, tz) };
      }
      return n;
    });
  }
}
