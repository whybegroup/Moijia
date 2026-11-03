import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { PushTokenInput, UsersService } from '@moijia/client';
import { navigateFromNotificationPayload } from '../utils/notificationNavigation';
import { requestPermissionPrompt } from '../utils/permissions';
import { refreshAppOnResume } from '../utils/refreshAppOnResume';
import { useNotifications, useUpdateNotification } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

if (Platform.OS === 'android') {
  void Notifications.setNotificationChannelAsync('default', {
    name: 'Notifications',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => undefined);
}

function pushPayloadFromResponse(
  response: Notifications.NotificationResponse
): Record<string, string | undefined> {
  const data = response.notification.request.content.data;
  if (!data || typeof data !== 'object') return {};
  return data as Record<string, string | undefined>;
}

async function resolveExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  const allowed = await requestPermissionPrompt(
    () => Notifications.getPermissionsAsync(),
    () => Notifications.requestPermissionsAsync(),
    {
      title: 'Notifications',
      message: 'Allow notifications in Settings so Moijia can alert you.',
    },
  );
  if (!allowed) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) {
    console.warn(
      'Push notifications need EXPO_PUBLIC_EAS_PROJECT_ID (or extra.eas.projectId in app.config).'
    );
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export function usePushNotifications(userId: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const registeredTokenRef = useRef<string | null>(null);
  const { data: notifs = [] } = useNotifications(userId ?? undefined);
  const updateNotification = useUpdateNotification();
  const unreadCount = notifs.filter((n) => !n.read).length;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Notifications.setBadgeCountAsync(userId ? unreadCount : 0).catch(() => undefined);
  }, [userId, unreadCount]);

  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      refreshAppOnResume();
    });

    let cancelled = false;

    const register = async () => {
      try {
        const token = await resolveExpoPushToken();
        if (cancelled || !token || token === registeredTokenRef.current) return;
        registeredTokenRef.current = token;
        const platform =
          Platform.OS === 'ios' ? PushTokenInput.platform.IOS : PushTokenInput.platform.ANDROID;
        await UsersService.registerPushToken(userId, {
          token,
          platform,
          deviceId: Device.modelName ?? undefined,
        });
      } catch {
        registeredTokenRef.current = null;
      }
    };

    void register();

    return () => {
      cancelled = true;
      receivedSub.remove();
      const token = registeredTokenRef.current;
      registeredTokenRef.current = null;
      if (token) {
        void UsersService.unregisterPushToken(userId, token).catch(() => undefined);
      }
    };
  }, [userId]);

  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponseIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !lastResponse) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const responseId = lastResponse.notification.request.identifier;
    if (handledResponseIdRef.current === responseId) return;
    handledResponseIdRef.current = responseId;

    refreshAppOnResume();
    const data = pushPayloadFromResponse(lastResponse);
    if (data.notificationId) {
      updateNotification.mutate({ id: data.notificationId, read: true });
    }
    requestAnimationFrame(() => {
      navigateFromNotificationPayload(router, pathname, {
        type: data.type,
        dest: data.dest,
        eventId: data.eventId,
        groupId: data.groupId,
        pollId: data.pollId,
        postId: data.postId,
        commentId: data.commentId,
        navigable: !!(data.groupId || data.eventId || data.pollId || data.postId),
      });
    });
  }, [lastResponse, router, pathname, userId, updateNotification]);
}
