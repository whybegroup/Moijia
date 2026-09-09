import { Notification } from '@moijia/client';

export type NotificationsPanelGroup = { id: string; name: string };

export type NotificationsPanelModalProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  notifications: Notification[];
  isLoading: boolean;
  groups: NotificationsPanelGroup[];
  groupColors: Record<string, string | undefined>;
};
