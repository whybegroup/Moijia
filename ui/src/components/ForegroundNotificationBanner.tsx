import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { usePathname } from 'expo-router';
import type { Notification as ApiNotification } from '@moijia/client';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { useNotifications, useUpdateNotification } from '../hooks/api';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { formatNotificationBody } from '../utils/notificationDisplay';
import { navigateFromNotificationPayload } from '../utils/notificationNavigation';
import { NotificationListIcon } from './NotificationListIcon';

const SHOW_MS = 5000;
const SLIDE = 14;
const DISMISS_Y = -36;
const DISMISS_VY = -650;

type Banner = {
  id: string;
  title: string;
  body: string;
  type: string;
  dest?: string;
  eventId?: string;
  groupId?: string;
  pollId?: string;
  postId?: string;
  commentId?: string;
};

function bannerFromPush(notification: Notifications.Notification): Banner | null {
  const { title, body, data } = notification.request.content;
  const heading = (title ?? '').trim();
  const detail = (body ?? '').trim();
  if (!heading && !detail) return null;
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, string | undefined>;
  return {
    id: payload.notificationId || notification.request.identifier,
    title: heading || 'Notification',
    body: formatNotificationBody(detail),
    type: payload.type ?? '',
    dest: payload.dest,
    eventId: payload.eventId,
    groupId: payload.groupId,
    pollId: payload.pollId,
    postId: payload.postId,
    commentId: payload.commentId,
  };
}

function bannerFromApi(n: ApiNotification): Banner {
  return {
    id: n.id,
    title: (n.title ?? '').trim() || 'Notification',
    body: formatNotificationBody((n.body ?? '').trim()),
    type: n.type ?? '',
    dest: n.dest ?? undefined,
    eventId: n.eventId ?? undefined,
    groupId: n.groupId ?? undefined,
    pollId: n.pollId ?? undefined,
    postId: n.postId ?? undefined,
    commentId: n.commentId ?? undefined,
  };
}

export function ForegroundNotificationBanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { userId } = useCurrentUserContext();
  const { data: notifs = [], isFetched } = useNotifications(userId ?? undefined);
  const updateNotification = useUpdateNotification();
  const [banner, setBanner] = useState<Banner | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-SLIDE)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRef = useRef<(next: Banner) => void>(() => undefined);
  const hideRef = useRef<() => void>(() => undefined);
  const openRef = useRef<() => void>(() => undefined);
  const bannerRef = useRef<Banner | null>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const shownIdsRef = useRef(new Set<string>());
  bannerRef.current = banner;

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const hide = () => {
    clearHideTimer();
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -80, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        dragY.setValue(0);
        setBanner(null);
      }
    });
  };
  hideRef.current = hide;

  const show = (next: Banner) => {
    if (shownIdsRef.current.has(next.id)) return;
    shownIdsRef.current.add(next.id);
    clearHideTimer();
    opacity.setValue(0);
    translateY.setValue(-SLIDE);
    dragY.setValue(0);
    setBanner(next);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    hideTimer.current = setTimeout(() => hideRef.current(), SHOW_MS);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };
  showRef.current = show;

  const open = () => {
    const payload = bannerRef.current;
    if (!payload) return;
    if (payload.id) {
      updateNotification.mutate({ id: payload.id, read: true });
    }
    hide();
    requestAnimationFrame(() => {
      navigateFromNotificationPayload(router, pathname, {
        type: payload.type,
        dest: payload.dest,
        eventId: payload.eventId,
        groupId: payload.groupId,
        pollId: payload.pollId,
        postId: payload.postId,
        commentId: payload.commentId,
        navigable: !!(payload.groupId || payload.eventId || payload.pollId || payload.postId),
      });
    });
  };
  openRef.current = open;

  const pauseTimer = () => {
    clearHideTimer();
  };

  const setDragY = (y: number) => {
    dragY.setValue(Math.min(0, y));
  };

  const settleDrag = (translationY: number, velocityY: number) => {
    if (translationY <= DISMISS_Y || velocityY <= DISMISS_VY) {
      hideRef.current();
      return;
    }
    Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    clearHideTimer();
    hideTimer.current = setTimeout(() => hideRef.current(), SHOW_MS);
  };

  const fireOpen = () => {
    openRef.current();
  };

  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Pan()
          .activeOffsetY([-8, 1000])
          .failOffsetX([-24, 24])
          .onBegin(() => {
            runOnJS(pauseTimer)();
          })
          .onUpdate((e) => {
            runOnJS(setDragY)(e.translationY);
          })
          .onEnd((e) => {
            runOnJS(settleDrag)(e.translationY, e.velocityY);
          }),
        Gesture.Tap().onEnd(() => {
          runOnJS(fireOpen)();
        })
      ),
    [dragY]
  );

  useEffect(() => {
    if (!userId) {
      seenIdsRef.current = null;
      shownIdsRef.current = new Set();
      return;
    }
    if (!isFetched) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(notifs.map((n) => n.id));
      return;
    }
    const unseen = notifs.filter((n) => !seenIdsRef.current!.has(n.id));
    if (unseen.length === 0) return;
    for (const n of unseen) seenIdsRef.current.add(n.id);
    const newest = unseen.reduce((a, b) =>
      new Date(a.ts).getTime() >= new Date(b.ts).getTime() ? a : b
    );
    showRef.current(bannerFromApi(newest));
  }, [isFetched, notifs, userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const next = bannerFromPush(notification);
      if (next) showRef.current(next);
    });
    return () => {
      sub.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!banner) return null;

  return (
    <View
      pointerEvents="box-none"
      collapsable={false}
      style={[styles.layer, { paddingTop: Math.max(insets.top, 8) + 8 }]}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={{
            opacity,
            transform: [{ translateY: Animated.add(translateY, dragY) }],
          }}
        >
          <View
            style={styles.card}
            accessibilityRole="alert"
            accessibilityLabel={`${banner.title}. ${banner.body}. Swipe up to dismiss.`}
          >
            <View style={styles.iconWrap}>
              <NotificationListIcon type={banner.type} icon="" color={Colors.text} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title} numberOfLines={1}>
                {banner.title}
              </Text>
              {banner.body ? (
                <Text style={styles.body} numberOfLines={2}>
                  {banner.body}
                </Text>
              ) : null}
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    elevation: 24,
    paddingHorizontal: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.lg,
    ...(Platform.OS === 'android' ? { elevation: 24 } : null),
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 18,
    color: Colors.text,
  },
  body: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSub,
  },
});
