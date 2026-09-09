import { View, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layout } from '../constants/theme';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { NotificationsPanelCard } from './NotificationsPanelCard';
import type { NotificationsPanelModalProps } from './notificationsPanelTypes';

export type { NotificationsPanelGroup, NotificationsPanelModalProps } from './notificationsPanelTypes';

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
  const panelTop = insets.top + Layout.tabHeaderMinHeight + 1 + 6;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} {...edgeToEdgeModalProps}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.panelWrap, { top: panelTop }]}>
          <NotificationsPanelCard
            onClose={onClose}
            userId={userId}
            notifications={notifications}
            isLoading={isLoading}
            groups={groups}
            groupColors={groupColors}
          />
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
  panelWrap: {
    position: 'absolute',
    right: 20,
    width: 300,
    maxWidth: '90%',
  },
});
