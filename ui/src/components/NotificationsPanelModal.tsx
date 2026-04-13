import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { Notification } from '@moijia/client';
import { Colors, Fonts, Layout, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../utils/helpers';
import { NotificationListIcon } from './NotificationListIcon';
import { useUpdateNotification, useMarkAllNotificationsRead } from '../hooks/api';
import { withReturnTo } from '../utils/navigationReturn';

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

export function NotificationsPanelModal({
  visible,
  onClose,
  userId,
  notifications,
  isLoading,
  groups,
  groupColors,
}: NotificationsPanelModalProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const updateNotification = useUpdateNotification();
  const markAllAsRead = useMarkAllNotificationsRead();

  const unread = notifications.filter((n) => !n.read).length;
  const panelTop = insets.top + Layout.tabHeaderMinHeight + 1 + 6;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.panel, { top: panelTop, right: 20 }]}>
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
                      if (n.dest === Notification.dest.EVENT && n.eventId) {
                        router.push(withReturnTo(`/event/${n.eventId}`, pathname));
                      } else if (n.dest === Notification.dest.GROUP && n.groupId) {
                        router.push(withReturnTo(`/groups/${n.groupId}`, pathname));
                      }
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
                          }}
                          numberOfLines={1}
                        >
                          {n.title}
                        </Text>
                        {!n.read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={{ fontSize: 12, color: Colors.textSub }} numberOfLines={1}>
                        {n.body}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, opacity: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  panel: {
    position: 'absolute',
    width: 300,
    maxWidth: '90%',
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
});
