import { PrismaClient } from '@prisma/client';
import { Notification, NotificationInput } from '../models';
import { notifTypeToPrefKey, parseNotifPrefsJson } from '../utils/notifPrefsCore';

const prisma = new PrismaClient();

export class NotificationService {
  /**
   * Get all notifications with optional user filtering
   */
  public async getAll(userId?: string): Promise<Notification[]> {
    const notifications = await prisma.notification.findMany({
      where: userId ? { userId } : undefined,
      orderBy: {
        ts: 'desc',
      },
    });
    return notifications.map((n) => this.mapNotification(n));
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
    return this.mapNotification(notification);
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
      dest?: 'group' | 'event';
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
      dest: options?.dest,
      navigable: !!(options?.groupId || options?.eventId),
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
      dest?: 'group' | 'event';
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
      dest: n.dest as 'group' | 'event' | null,
    };
  }
}
