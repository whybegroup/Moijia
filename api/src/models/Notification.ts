/**
 * Notification model
 */
export interface Notification {
  /** Unique notification identifier */
  id: string;
  /** Notification type */
  type: string;
  /** Whether the notification has been read */
  read: boolean;
  /** Timestamp of the notification */
  ts: Date;
  /** Icon identifier */
  icon: string;
  /** Notification title */
  title: string;
  /** Notification body text */
  body: string;
  /** Related group ID (if applicable) */
  groupId?: string | null;
  /** Related event ID (if applicable) */
  eventId?: string | null;
  /** Related poll ID (in-app; when dest is poll) */
  pollId?: string | null;
  /** Whether this notification is navigable/clickable */
  navigable: boolean;
  /** Navigation destination */
  dest?: 'group' | 'event' | 'poll' | null;
  /** User ID this notification is for */
  userId?: string | null;
  /** Timestamp when created */
  createdAt: Date;
  /** Timestamp when updated */
  updatedAt: Date;
}

/**
 * Input for creating a notification
 */
export interface NotificationInput {
  id: string;
  type: string;
  read?: boolean;
  ts?: Date | string;
  icon: string;
  title: string;
  body: string;
  groupId?: string;
  eventId?: string;
  pollId?: string;
  navigable?: boolean;
  dest?: 'group' | 'event' | 'poll';
  userId?: string;
}
