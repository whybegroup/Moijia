import { PrismaClient } from '@prisma/client';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import type { Notification } from '../models';

const prisma = new PrismaClient();
const expo = new Expo();

export class PushNotificationService {
  public async sendForNotification(notification: Notification): Promise<void> {
    if (!notification.userId) return;

    const rows = await prisma.pushToken.findMany({
      where: { userId: notification.userId },
      select: { token: true },
    });
    if (rows.length === 0) return;

    const data: Record<string, string> = {
      notificationId: notification.id,
      type: notification.type,
    };
    if (notification.groupId) data.groupId = notification.groupId;
    if (notification.eventId) data.eventId = notification.eventId;
    if (notification.pollId) data.pollId = notification.pollId;
    if (notification.postId) data.postId = notification.postId;
    if (notification.commentId) data.commentId = notification.commentId;
    if (notification.dest) data.dest = notification.dest;

    const unreadCount = await prisma.notification.count({
      where: { userId: notification.userId, read: false },
    });

    const messages: ExpoPushMessage[] = [];
    for (const { token } of rows) {
      if (!Expo.isExpoPushToken(token)) continue;
      messages.push({
        to: token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        badge: unreadCount,
        data,
      });
    }
    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        await this.pruneInvalidTokens(chunk, tickets);
      } catch {
        // Push delivery is best-effort; in-app notification already persisted
      }
    }
  }

  private async pruneInvalidTokens(
    messages: ExpoPushMessage[],
    tickets: ExpoPushTicket[]
  ): Promise<void> {
    const stale: string[] = [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status !== 'error') continue;
      if (ticket.details?.error === 'DeviceNotRegistered') {
        const to = messages[i]?.to;
        if (typeof to === 'string') stale.push(to);
      }
    }
    if (stale.length === 0) return;
    await prisma.pushToken.deleteMany({ where: { token: { in: stale } } });
  }
}
