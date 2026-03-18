import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, fmtTime, fmtMonthShort, dDiff, isToday as checkToday } from '../utils/helpers';
import type { EventDetailed, Group } from '@boltup/client';
import { AvatarStack } from './ui';

interface EventRowProps {
  ev: EventDetailed;
  group?: Group;
  groupColorHex?: string;
  onPress: () => void;
  onGroupPress?: (groupId: string) => void;
  isLast?: boolean;
  showGroup?: boolean;
  meId?: string;
}

export function EventRow({ ev, group, groupColorHex, onPress, onGroupPress, isLast, showGroup = true, meId }: EventRowProps) {
  const p      = getGroupColor(groupColorHex || (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899'));
  const evStart = typeof ev.start === 'string' ? new Date(ev.start) : ev.start;
  const diff   = dDiff(evStart);
  const isPast = evStart.getTime() < Date.now();
  const isToday_ = diff === 0;
  const rsvps  = ev.rsvps || [];
  const going  = rsvps.filter(r => r.status === 'going');
  const myRsvp = meId ? rsvps.find(r => r.userId === meId) : undefined;
  const cc     = ev.comments?.length || 0;
  const needsMore = (ev.minAttendees || 0) > 0 && going.length < (ev.minAttendees || 0) && !isPast;
  const hoursLeft = Math.max(0, Math.floor((evStart.getTime() - Date.now()) / 3600000));
  const showHoursLeft = !isPast && hoursLeft <= 6 && hoursLeft > 0;

  const metaParts = [
    fmtTime(evStart),
    myRsvp?.status === 'going'    ? '✓ Going'    : null,
    myRsvp?.status === 'notGoing' ? '✗ Can\'t go' : null,
    cc > 0 ? `${cc} comment${cc !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

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
      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{ev.title}</Text>
        {showGroup && group && (
          <Pressable
            onPress={() => onGroupPress?.(ev.groupId)}
            style={({ pressed }) => [
              styles.groupNameWrap,
              onGroupPress && pressed && { backgroundColor: p.label, borderRadius: 6 },
            ]}
            disabled={!onGroupPress}
          >
            <Text style={[styles.groupName, onGroupPress && { color: p.dot }]} numberOfLines={1}>{group.name}</Text>
          </Pressable>
        )}
        <Text style={styles.meta} numberOfLines={1}>{metaParts}</Text>
        {ev.location ? (
          <Text style={styles.location} numberOfLines={1}>{ev.location}</Text>
        ) : null}
        {(ev.minAttendees || 0) > 0 && !isPast && (
          <Text style={styles.minAttendees} numberOfLines={1}>
            👥 Min {ev.minAttendees} needed{ev.deadline ? ` · RSVP by ${fmtTime(typeof ev.deadline === 'string' ? new Date(ev.deadline) : ev.deadline)}` : ''}
          </Text>
        )}
        {going.length > 0 && (
          <View style={styles.avatarRow}>
            <AvatarStack names={going.map(r => r.userId)} size={20} max={10} />
          </View>
        )}
        {needsMore && (
          <View style={styles.needsTextWrap}>
            <Text style={styles.needsText}>
              ⚠️ Need {(ev.minAttendees || 0) - going.length} more to confirm
            </Text>
          </View>
        )}
        {showHoursLeft && (
          <View style={styles.hoursLeftWrap}>
            <Text style={styles.hoursLeftText}>
              ⏰ Starting in {hoursLeft}h
            </Text>
          </View>
        )}
      </View>

      {/* Calendar badge */}
      <View style={styles.badge}>
        <View style={[styles.badgeTop, { backgroundColor: isToday_ ? Colors.todayRed : p.cal }]}>
          <Text style={styles.badgeMonth}>{isToday_ ? 'TODAY' : fmtMonthShort(evStart)}</Text>
        </View>
        <View style={styles.badgeBottom}>
          <Text style={styles.badgeDay}>{evStart.getDate()}</Text>
        </View>
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
    fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 2,
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
    fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted,
  },
  meta: {
    fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted,
  },
  needsTextWrap: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  needsText: {
    fontSize: 12, fontFamily: Fonts.medium, color: '#92400E',
  },
  hoursLeftWrap: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  hoursLeftText: {
    fontSize: 12, fontFamily: Fonts.medium, color: '#92400E',
  },
  location: {
    fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 1,
  },
  minAttendees: {
    fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 1,
  },
  avatarRow: {
    marginTop: 6,
  },
  badge: {
    width: 38, borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
    ...Shadows.xs,
    flexShrink: 0,
  },
  badgeTop: {
    paddingVertical: 2, alignItems: 'center',
  },
  badgeMonth: {
    fontSize: 9, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 0.4,
  },
  badgeBottom: {
    backgroundColor: Colors.surface, paddingVertical: 3, alignItems: 'center',
  },
  badgeDay: {
    fontSize: 17, fontFamily: Fonts.bold, color: Colors.text, lineHeight: 20,
  },
});
