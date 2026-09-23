import type { ComponentProps } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

type IonName = ComponentProps<typeof Ionicons>['name'];

/** Server `Notification.type` → vector icon (reliable on iOS/Android; avoids emoji font issues). */
const TYPE_TO_ICON: Record<string, IonName> = {
  event_created: 'calendar-outline',
  event_reminder: 'alarm-outline',
  rsvp: 'checkmark-circle-outline',
  rsvp_update: 'people-outline',
  waitlist_promotion: 'arrow-up-circle-outline',
  comment: 'chatbubble-outline',
  comment_added: 'chatbubble-outline',
  mention: 'at-outline',
  group_approval: 'person-add-outline',
  group_join_request: 'person-add-outline',
  friend_group_request: 'people-outline',
  friend_group_accepted: 'people-circle-outline',
  group_membership: 'people-outline',
  time_suggestion: 'time-outline',
  event_time_changed: 'time-outline',
  location_changed: 'location-outline',
  poll_option_suggestion: 'add-circle-outline',
  poll_created: 'stats-chart-outline',
  poll_updated: 'create-outline',
  poll_closed: 'lock-closed-outline',
  poll_response: 'checkbox-outline',
  poll_option_decision: 'checkmark-circle-outline',
  group_announcement: 'megaphone-outline',
  group_storage: 'cloud-circle-outline',
  post_comment: 'chatbubble-ellipses-outline',
  post_reaction: 'happy-outline',
  general: 'notifications-outline',
};

function ionForType(type: string | undefined | null): IonName | null {
  if (!type?.trim()) return null;
  const key = type.trim();
  return TYPE_TO_ICON[key] ?? TYPE_TO_ICON[key.toLowerCase()] ?? null;
}

function normalizeEmojiFallback(raw: string | undefined | null): string {
  const s = (raw ?? '').trim();
  if (!s) return '🔔';
  if (s === '\u2713' || s === '\u2714' || s === '✓' || s === '✔') return '✅';
  return s;
}

function EmojiFallback({ icon }: { icon: string }) {
  const glyph = normalizeEmojiFallback(icon);
  return (
    <Text
      allowFontScaling={false}
      {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
      style={styles.emoji}
    >
      {glyph}
    </Text>
  );
}

type Props = {
  /** API notification type (preferred for icon choice). */
  type: string;
  /** Legacy emoji from API; used only when `type` is unknown. */
  icon: string;
  /** Tint for the vector icon (e.g. group accent). */
  color?: string;
};

const ION_FROM_ICON = new Set<string>(Object.values(TYPE_TO_ICON));

function ionForStoredIcon(icon: string | undefined | null): IonName | null {
  const raw = icon?.trim();
  if (!raw) return null;
  if (ION_FROM_ICON.has(raw)) return raw as IonName;
  const fromType = ionForType(raw);
  if (fromType) return fromType;
  if (
    raw === 'people-outline' ||
    raw === 'people-circle-outline' ||
    raw === 'person-add-outline'
  ) {
    return raw;
  }
  return null;
}

export function NotificationListIcon({ type, icon, color = Colors.text }: Props) {
  const name = ionForType(type) ?? ionForStoredIcon(icon);
  if (name) {
    return <Ionicons name={name} size={20} color={color} />;
  }
  return <EmojiFallback icon={icon} />;
}

const styles = StyleSheet.create({
  emoji: {
    fontSize: 19,
    textAlign: 'center',
    ...Platform.select({
      ios: { fontFamily: 'Apple Color Emoji', lineHeight: 22 },
      android: { fontSize: 20, lineHeight: 22 },
      default: { lineHeight: 22 },
    }),
  },
});
