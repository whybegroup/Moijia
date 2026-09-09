import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layout } from '../constants/theme';
import { webAppColumnOffsetX, webAppColumnWidth } from '../utils/webAppColumnCoords';
import {
  NOTIFICATIONS_PANEL_EDGE_INSET,
  NOTIFICATIONS_PANEL_WIDTH,
  NotificationsPanelCard,
} from './NotificationsPanelCard';
import type { NotificationsPanelModalProps } from './notificationsPanelTypes';

export type { NotificationsPanelGroup, NotificationsPanelModalProps } from './notificationsPanelTypes';

/**
 * Body portal (not an RN Modal / `role="dialog"`), so column-pin CSS does not apply.
 * `right` is header padding plus the column gutter (0 on mobile).
 */
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
  const [layout, setLayout] = useState(() => ({
    right: NOTIFICATIONS_PANEL_EDGE_INSET + webAppColumnOffsetX(),
    width: Math.min(NOTIFICATIONS_PANEL_WIDTH, webAppColumnWidth() * 0.9),
  }));

  useLayoutEffect(() => {
    const update = () => {
      setLayout({
        right: NOTIFICATIONS_PANEL_EDGE_INSET + webAppColumnOffsetX(),
        width: Math.min(NOTIFICATIONS_PANEL_WIDTH, webAppColumnWidth() * 0.9),
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <View style={styles.root}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notifications"
      />
      <View style={[styles.panelWrap, { top: panelTop, right: layout.right, width: layout.width }]}>
        <NotificationsPanelCard
          onClose={onClose}
          userId={userId}
          notifications={notifications}
          isLoading={isLoading}
          groups={groups}
          groupColors={groupColors}
        />
      </View>
    </View>,
    document.body
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  panelWrap: {
    position: 'absolute',
  },
});
