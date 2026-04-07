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
  time_suggestion: 'time-outline',
  event_time_changed: 'time-outline',
  location_changed: 'location-outline',
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

export function NotificationListIcon({ type, icon, color = Colors.text }: Props) {
  const name = ionForType(type);
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
