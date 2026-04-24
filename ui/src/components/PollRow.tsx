import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Poll, GroupScoped } from '@moijia/client';
import { PollOptionInputKind } from '@moijia/client';
import { Colors, Fonts } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, fmtTime } from '../utils/helpers';

function stripHtmlPreview(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deadlineForPoll(poll: Poll): Date | null {
  if ((poll as Poll & { deadline?: string | null }).deadline) {
    const direct = new Date((poll as Poll & { deadline?: string | null }).deadline as string);
    if (Number.isFinite(direct.getTime())) return direct;
  }
  let minTs = Number.POSITIVE_INFINITY;
  for (const option of poll.options) {
    if (option.inputKind !== PollOptionInputKind.DATETIME || !option.dateTimeValue) continue;
    const ts = new Date(option.dateTimeValue).getTime();
    if (Number.isFinite(ts) && ts < minTs) minTs = ts;
  }
  return Number.isFinite(minTs) ? new Date(minTs) : null;
}

function formatClosesByLine(d: Date): string {
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  return `Closes by ${dateStr} ${fmtTime(d)}`;
}

export interface PollRowProps {
  poll: Poll;
  group?: GroupScoped;
  groupColorHex?: string;
  onPress: () => void;
  onGroupPress?: (groupId: string) => void;
  isLast?: boolean;
  showGroup?: boolean;
}

export function PollRow({
  poll,
  group,
  groupColorHex,
  onPress,
  onGroupPress,
  isLast = false,
  showGroup = true,
}: PollRowProps) {
  const p = getGroupColor(groupColorHex || (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899'));
  const dl = deadlineForPoll(poll);
  const now = Date.now();
  const isPast = dl ? dl.getTime() <= now : false;

  const closesLine = dl ? formatClosesByLine(dl) : 'No deadline set';
  const descPreview = poll.description?.trim()
    ? stripHtmlPreview(poll.description).slice(0, 120) + (stripHtmlPreview(poll.description).length > 120 ? '…' : '')
    : '';

  const memberTotal = group?.memberCount ?? 0;
  const responded = poll.respondentCount ?? 0;
  const responseLine = `${responded}/${memberTotal} Responded`;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: isPast ? '#F5F5F4' : Colors.surface,
          borderLeftWidth: 3,
          borderLeftColor: isPast ? Colors.border : p.dot,
          opacity: isPast ? 0.5 : 1,
        },
        !isLast && styles.rowBorder,
      ]}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.title} numberOfLines={1}>
            {poll.title}
          </Text>
        </View>
        {showGroup && group ? (
          <Pressable
            onPress={() => onGroupPress?.(poll.groupId)}
            style={({ pressed }) => [
              styles.groupNameWrap,
              onGroupPress && pressed && { backgroundColor: p.label, borderRadius: 6 },
            ]}
            disabled={!onGroupPress}
          >
            <Text style={[styles.groupName, onGroupPress && { color: p.dot }]} numberOfLines={1}>
              {group.name}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={14} color={Colors.textMuted} style={styles.metaIcon} />
          <Text style={styles.meta} numberOfLines={2}>
            {closesLine}
          </Text>
        </View>
        {descPreview ? (
          <View style={styles.descRow}>
            <Ionicons name="document-text-outline" size={14} color={Colors.textMuted} style={styles.metaIcon} />
            <Text style={styles.meta} numberOfLines={2}>
              {descPreview}
            </Text>
          </View>
        ) : null}
        <Text style={styles.responseLine}>{responseLine}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
    position: 'relative',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  content: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 2,
  },
  groupNameWrap: {
    alignSelf: 'flex-start',
    marginBottom: 2,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    paddingVertical: 2,
    marginVertical: -2,
  },
  groupName: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 1,
  },
  descRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 3,
  },
  metaIcon: {
    marginTop: 1,
  },
  meta: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  responseLine: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
  },
});
