import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, fmtTime, fmtMonthShort, dDiff, getMyWaitlistPosition } from '../utils/helpers';
import type { EventDetailed, GroupScoped, User } from '@moija/client';
import { UserAvatarStack } from './UserAvatarStack';

interface EventRowProps {
  ev: EventDetailed;
  group?: GroupScoped;
  groupColorHex?: string;
  onPress: () => void;
  onGroupPress?: (groupId: string) => void;
  isLast?: boolean;
  showGroup?: boolean;
  meId?: string;
  users?: User[];
}

export function EventRow({ ev, group, groupColorHex, onPress, onGroupPress, isLast, showGroup = true, meId, users = [] }: EventRowProps) {
  const p      = getGroupColor(groupColorHex || (group ? getDefaultGroupThemeFromName(group.name) : '#EC4899'));
  const evStart = typeof ev.start === 'string' ? new Date(ev.start) : ev.start;
  const evEnd = typeof ev.end === 'string' ? new Date(ev.end) : ev.end;
  const now = Date.now();
  const isOngoing = evStart.getTime() <= now && evEnd.getTime() > now;
  const diff   = dDiff(evStart);
  const isPast = evEnd.getTime() <= Date.now();
  const isToday_ = diff === 0;
  const rsvps  = ev.rsvps || [];
  const going  = rsvps.filter(r => r.status === 'going');
  const myRsvp = meId ? rsvps.find(r => r.userId === meId) : undefined;
  const cc     = ev.comments?.length || 0;
  const minN = ev.minAttendees || 0;
  const maxN = ev.maxAttendees || 0;
  const needsMore = minN > 0 && going.length < minN && !isPast;
  const spotsLeft = maxN > 0 ? Math.max(0, maxN - going.length) : 0;
  const showLowSpots = maxN > 0 && !isPast && spotsLeft > 0 && spotsLeft <= 5;
  const imWaitlisted = myRsvp?.status === 'waitlist' && !isPast;
  const myWaitlistPos = imWaitlisted ? getMyWaitlistPosition(rsvps, meId) : null;
  const hoursLeft = Math.max(0, Math.floor((evStart.getTime() - Date.now()) / 3600000));
  const showHoursLeft = !isPast && hoursLeft <= 6 && hoursLeft > 0;
  const usersWithMemos = new Set(rsvps.filter(r => r.memo && r.memo.trim()).map(r => r.userId));
  
  const usersMap: Record<string, User> = {};
  users.forEach(u => {
    usersMap[u.id] = u;
  });
  
  const getUserSafe = (userId: string): User => {
    return usersMap[userId] || {
      id: userId,
      name: 'Loading...',
      displayName: 'Loading...',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const isMultiDay = evStart.toDateString() !== evEnd.toDateString();
  
  let timeDisplay = '';
  if (isMultiDay) {
    const startDateStr = `${evStart.getMonth() + 1}/${evStart.getDate()}/${String(evStart.getFullYear()).slice(-2)}`;
    const endDateStr = `${evEnd.getMonth() + 1}/${evEnd.getDate()}/${String(evEnd.getFullYear()).slice(-2)}`;
    if (ev.isAllDay) {
      timeDisplay = `${startDateStr} – ${endDateStr}`;
    } else {
      timeDisplay = `${startDateStr} ${fmtTime(evStart)} – ${endDateStr} ${fmtTime(evEnd)}`;
    }
  } else {
    timeDisplay = ev.isAllDay ? 'All day' : `${fmtTime(evStart)} – ${fmtTime(evEnd)}`;
  }
  
  const metaParts = [
    timeDisplay,
    myRsvp?.status === 'going' ? 'Going' : null,
    myRsvp?.status === 'notGoing' ? 'Can\'t go' : null,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.title} numberOfLines={1}>{ev.title}</Text>
          {isOngoing && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
            </View>
          )}
        </View>
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
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={14} color={Colors.textMuted} style={styles.metaIcon} />
          <Text style={styles.meta} numberOfLines={2}>
            {metaParts}
          </Text>
        </View>
        {ev.location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={Colors.textMuted} style={styles.metaIcon} />
            <Text style={styles.location} numberOfLines={1}>
              {ev.location}
            </Text>
          </View>
        ) : null}
        {(minN > 0 || maxN > 0) && !isPast && (
          <View style={styles.minAttendeesRow}>
            <Ionicons name="people-outline" size={14} color={Colors.textMuted} style={styles.minAttendeesIcon} />
            <Text style={styles.minAttendees} numberOfLines={2}>
              {[
                minN > 0 ? `Min ${minN}` : null,
                maxN > 0 ? `Max ${maxN}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        )}
        {going.length > 0 && (
          <View style={styles.avatarRow}>
            <UserAvatarStack
              userIds={going.map(r => r.userId)}
              getUser={getUserSafe}
              size={20}
              max={10}
              dotUserIds={Array.from(usersWithMemos)}
            />
          </View>
        )}
        {needsMore && (
          <View style={styles.needsTextWrap}>
            <Ionicons name="warning-outline" size={14} color="#92400E" style={styles.pillIcon} />
            <Text style={styles.needsText}>
              {minN - going.length} more needed
            </Text>
          </View>
        )}
        {showLowSpots && (
          <View style={styles.needsTextWrap}>
            <Ionicons name="warning-outline" size={14} color="#92400E" style={styles.pillIcon} />
            <Text style={styles.needsText}>
              {spotsLeft} spot{spotsLeft === 1 ? '' : 's'} left
            </Text>
          </View>
        )}
        {imWaitlisted && (
          <View style={styles.needsTextWrap}>
            <Ionicons name="warning-outline" size={14} color="#92400E" style={styles.pillIcon} />
            <Text style={styles.needsText}>
              Waitlisted{myWaitlistPos != null ? ` · #${myWaitlistPos} in queue` : ''}
            </Text>
          </View>
        )}
        {showHoursLeft && (
          <View style={styles.hoursLeftWrap}>
            <Ionicons name="time-outline" size={14} color="#92400E" style={styles.pillIcon} />
            <Text style={styles.hoursLeftText}>
              Starting in {hoursLeft}h
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 1,
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 3,
  },
  needsTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  pillIcon: { marginTop: 0 },
  needsText: {
    fontSize: 12, fontFamily: Fonts.medium, color: '#92400E',
  },
  hoursLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
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
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  minAttendeesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 1,
    gap: 5,
  },
  minAttendeesIcon: { marginTop: 1 },
  minAttendees: {
    flex: 1,
    fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted,
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
  liveBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
});
