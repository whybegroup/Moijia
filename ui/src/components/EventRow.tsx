import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, fmtTime, getMyWaitlistPosition } from '../utils/helpers';
import type { EventDetailed, GroupScoped, User } from '@moijia/client';
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
  const isPast = evEnd.getTime() <= Date.now();
  const rsvps  = ev.rsvps || [];
  const going  = rsvps.filter(r => r.status === 'going');
  const myRsvp = meId ? rsvps.find(r => r.userId === meId) : undefined;
  const cc     = ev.comments?.length || 0;
  const tasks = ev.tasks ?? [];
  const taskTotal = tasks.length;
  const taskDone = tasks.filter((t) => t.completed).length;
  const taskPct = taskTotal === 0 ? 0 : Math.round((taskDone / taskTotal) * 100);
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
          opacity: isPast ? 0.5 : 1,
        },
        !isLast && styles.rowBorder,
      ]}
      activeOpacity={0.7}
      collapsable={false}
    >
      <View
        pointerEvents="none"
        collapsable={false}
        style={[styles.themeAccent, { backgroundColor: isPast ? Colors.border : p.dot }]}
      />
      {/* Content */}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {ev.name}
          </Text>
          {isOngoing ? (
            <View style={styles.inProgressPill}>
              <Ionicons name="radio-button-on" size={11} color="#1D4ED8" />
              <Text style={styles.inProgressPillText}>In progress</Text>
            </View>
          ) : null}
        </View>
        {taskTotal > 0 ? (
          <View
            style={styles.taskProgress}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: taskPct }}
            accessibilityLabel={`${taskPct}% (${taskDone} of ${taskTotal}) tasks complete`}
          >
            <Ionicons name="hammer-outline" size={13} color={Colors.textMuted} />
            <View style={styles.taskTrack}>
              <View
                style={[
                  styles.taskFill,
                  { width: `${taskPct}%` },
                  taskPct === 100 ? styles.taskFillDone : null,
                ]}
              />
            </View>
            <Text style={styles.taskProgressLabel}>
              {taskPct}% ({taskDone} of {taskTotal})
            </Text>
          </View>
        ) : null}
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
            <Ionicons name="chevron-expand-outline" size={14} color={Colors.textMuted} style={styles.minAttendeesIcon} />
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
        {showGroup && group && (
          <View style={styles.groupNameRow}>
            <Ionicons name="people-outline" size={14} color={Colors.textMuted} style={styles.groupIcon} />
            <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
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
              {minN - going.length} more people needed
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
    overflow: 'hidden',
  },
  themeAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  content: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  inProgressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inProgressPillText: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: '#1E40AF',
  },
  groupNameWrap: {
    alignSelf: 'flex-start',
    marginBottom: 2,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    paddingVertical: 2,
    marginVertical: -2,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  groupIcon: {
    marginTop: 0,
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
  taskProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
    maxWidth: '100%',
  },
  taskTrack: {
    width: 72,
    height: 4,
    borderRadius: 99,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  taskFill: {
    height: 4,
    borderRadius: 99,
    backgroundColor: Colors.accent,
  },
  taskFillDone: {
    backgroundColor: Colors.going,
  },
  taskProgressLabel: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
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
});
