import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { usePathname } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Notification } from '@moijia/client';
import { Colors, Fonts, Layout, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../utils/helpers';
import { NotificationListIcon } from './NotificationListIcon';
import { useUpdateNotification, useMarkAllNotificationsRead } from '../hooks/api';
import { navigateFromNotification } from '../utils/notificationNavigation';
import { formatNotificationTimestamp } from '../utils/notificationDisplay';
import type { NotificationsPanelGroup } from './notificationsPanelTypes';

export const NOTIFICATIONS_PANEL_WIDTH = 300;
export const NOTIFICATIONS_PANEL_EDGE_INSET = 20;

type Props = {
  onClose: () => void;
  userId: string;
  notifications: Notification[];
  isLoading: boolean;
  groups: NotificationsPanelGroup[];
  groupColors: Record<string, string | undefined>;
  style?: StyleProp<ViewStyle>;
};

export function NotificationsPanelCard({
  onClose,
  userId,
  notifications,
  isLoading,
  groups,
  groupColors,
  style,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const updateNotification = useUpdateNotification();
  const markAllAsRead = useMarkAllNotificationsRead();
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <View style={[styles.panel, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {unread > 0 && (
          <TouchableOpacity
            onPress={() => {
              if (userId) markAllAsRead.mutate(userId);
            }}
          >
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color={Colors.textSub} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No new notifications</Text>
          </View>
        ) : (
          notifications.map((n, i) => {
            const group = groups.find((g) => g.id === n.groupId);
            const userColorHex = group
              ? groupColors[group.id] || getDefaultGroupThemeFromName(group.name)
              : '#EC4899';
            const p = getGroupColor(userColorHex);
            return (
              <TouchableOpacity
                key={n.id}
                onPress={() => {
                  if (!n.read) {
                    updateNotification.mutate({ id: n.id, read: true });
                  }
                  if (!n.navigable) return;
                  onClose();
                  requestAnimationFrame(() => {
                    navigateFromNotification(router, pathname, n);
                  });
                }}
                style={[
                  styles.row,
                  { backgroundColor: n.read ? 'transparent' : p.row },
                  i < notifications.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border },
                ]}
                activeOpacity={n.navigable ? 0.7 : 1}
              >
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: n.read ? Colors.bg : p.row,
                      borderColor: n.read ? Colors.border : p.cal,
                    },
                  ]}
                >
                  <NotificationListIcon
                    type={n.type}
                    icon={n.icon}
                    color={n.read ? Colors.textSub : p.text}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: n.read ? Fonts.medium : Fonts.bold,
                        color: Colors.text,
                        flex: 1,
                        minWidth: 0,
                      }}
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                    {!n.read && <View style={styles.unreadDot} />}
                    <Text style={styles.ts} numberOfLines={1}>
                      {formatNotificationTimestamp(n.ts)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: Colors.textSub }} numberOfLines={2}>
                    {n.body}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    elevation: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: Layout.modalTopBarHeight,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text },
  markAll: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub },
  scroll: { maxHeight: 340 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyWrap: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textAlign: 'center',
  },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.notGoing },
  ts: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.textMuted, flexShrink: 0 },
});
