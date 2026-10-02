import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useAppRouter as useRouter } from '../../../hooks/useAppRouter';
import { runOnJS } from 'react-native-reanimated';
import ReorderableList, {
  reorderItems,
  useIsActive,
  useReorderableDrag,
  type ReorderableListRenderItemInfo,
} from 'react-native-reorderable-list';
import { Colors, Fonts, Radius, Shadows } from '../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../../utils/helpers';
import { useEvents, useAllGroupMemberColors, useUpdateGroupOrder } from '../../../hooks/api';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';
import { GroupAvatar } from '../../../components/GroupAvatar';
import { useListGroups } from '../../../hooks/useListGroups';
import { usePullToRefresh } from '../../../hooks/usePullToRefresh';
import type { GroupScoped } from '@moijia/client';

const groupsListPanGesture = Gesture.Pan().activateAfterLongPress(520);

type ActiveGroupRowProps = {
  group: GroupScoped;
  groupColors: Record<string, string>;
  events: Array<{ groupId: string; start: string }>;
  now: Date;
  upcomingWeekEnd: Date;
  currentUserId: string | undefined;
  onOpenGroup: (groupId: string) => void;
};

function ActiveGroupRow({
  group: g,
  groupColors,
  events,
  now,
  upcomingWeekEnd,
  currentUserId,
  onOpenGroup,
}: ActiveGroupRowProps) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();
  const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
  const p = getGroupColor(userColorHex);
  const announcementTrim = (g.announcement ?? '').trim();
  const evCount = events.filter((e) => {
    const start = new Date(e.start);
    return e.groupId === g.id && start >= now && start <= upcomingWeekEnd;
  }).length;

  return (
    <Pressable
      onPress={isActive ? undefined : () => onOpenGroup(g.id)}
      onLongPress={isActive ? undefined : drag}
      delayLongPress={120}
      style={[styles.groupItemCard, isActive && styles.groupItemCardDragging, isActive && Shadows.sm]}
      accessibilityRole="button"
      accessibilityLabel={g.name}
      accessibilityHint="Hold and drag to reorder"
    >
      <View style={styles.row}>
        <View style={styles.dragHandle} pointerEvents="none">
          <Ionicons name="reorder-three" size={22} color={Colors.textMuted} />
        </View>
        <View style={styles.rowBody}>
          <View style={[styles.groupIconOuter, { backgroundColor: p.cal }]}>
            <View style={styles.groupIconInner}>
              <GroupAvatar seed={g.avatarSeed} thumbnail={g.thumbnail} name={g.name} size={44} />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.groupName}>{g.name}</Text>
            <Text style={styles.groupMeta}>
              {g.memberCount} members
              {evCount > 0 ? ` · ${evCount} upcoming events` : ''}
            </Text>
            {announcementTrim ? (
              <View style={styles.groupAnnouncementRow}>
                <Ionicons name="megaphone-outline" size={14} color={Colors.maybe} style={{ flexShrink: 0 }} />
                <Text style={styles.groupAnnouncementText} numberOfLines={1} ellipsizeMode="tail">
                  {announcementTrim}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {g.membershipStatus === 'pending' && (
              <View style={[styles.adminBadge, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <Text style={[styles.adminBadgeText, { color: '#B45309' }]}>Pending</Text>
              </View>
            )}
            {g.ownerId === currentUserId && (
              <View style={[styles.adminBadge, { backgroundColor: '#FEF9C3', borderColor: '#EAB308' }]}>
                <Text style={[styles.adminBadgeText, { color: '#854D0E' }]}>Owner</Text>
              </View>
            )}
            {g.membershipStatus === 'admin' && g.ownerId !== currentUserId && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
            <Text style={{ color: Colors.textMuted, fontSize: 18 }}>›</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function GroupsScreen() {
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  const [isDragging, setIsDragging] = useState(false);

  const { listGroups, refetch: refetchGroups } = useListGroups(currentUserId ?? '', false);
  const updateGroupOrder = useUpdateGroupOrder(currentUserId ?? '');
  const { data: events = [], refetch: refetchEvents } = useEvents({
    userId: currentUserId ?? '',
    groupId: undefined,
  });
  const { data: groupColors = {}, refetch: refetchGroupColors } = useAllGroupMemberColors(
    currentUserId || ''
  );
  const { refreshControl } = usePullToRefresh(
    [refetchGroups, refetchEvents, refetchGroupColors],
    { enabled: !isDragging }
  );

  const activeGroups = useMemo(() => listGroups.filter((g) => !g.deletedAt), [listGroups]);
  const [orderedActiveGroups, setOrderedActiveGroups] = useState<GroupScoped[]>([]);

  useEffect(() => {
    if (isDragging) return;
    setOrderedActiveGroups(activeGroups);
  }, [activeGroups, isDragging]);

  const handleDragStart = useCallback(() => {
    'worklet';
    runOnJS(setIsDragging)(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    'worklet';
    runOnJS(setIsDragging)(false);
  }, []);

  const handleReorder = useCallback(
    ({ from, to }: { from: number; to: number }) => {
      setOrderedActiveGroups((prev) => {
        const data = reorderItems(prev, from, to);
        if (currentUserId && data.length >= 2) {
          updateGroupOrder.mutate(data.map((g) => g.id));
        }
        return data;
      });
    },
    [currentUserId, updateGroupOrder]
  );

  const now = new Date();
  const upcomingWeekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const openGroup = useCallback(
    (groupId: string) => {
      router.push(`/(tabs)/groups/${groupId}` as import('expo-router').Href);
    },
    [router]
  );

  const renderActiveGroupRow = useCallback(
    ({ item: g }: ReorderableListRenderItemInfo<GroupScoped>) => (
      <ActiveGroupRow
        group={g}
        groupColors={groupColors}
        events={events}
        now={now}
        upcomingWeekEnd={upcomingWeekEnd}
        currentUserId={currentUserId}
        onOpenGroup={openGroup}
      />
    ),
    [groupColors, events, now, upcomingWeekEnd, currentUserId, openGroup]
  );

  const listFooter = <View style={styles.listBottomPad} />;

  return (
    <View style={styles.page}>
      {listGroups.length === 0 ? (
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.myEmpty}
          refreshControl={refreshControl}
        >
          <Ionicons name="people-outline" size={48} color={Colors.textMuted} style={styles.emptyGlyph} />
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptyDesc}>Create a group or join with an invite code.</Text>
        </ScrollView>
      ) : orderedActiveGroups.length > 0 ? (
        <ReorderableList
          data={orderedActiveGroups}
          keyExtractor={(g) => g.id}
          renderItem={renderActiveGroupRow}
          onReorder={handleReorder}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          shouldUpdateActiveItem
          panGesture={groupsListPanGesture}
          cellAnimations={{ opacity: 1, transform: [] }}
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.groupItemGap} />}
          ListFooterComponent={listFooter}
          refreshControl={refreshControl}
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
        >
          {listFooter}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  listContainer: { flex: 1 },
  listContent: { paddingHorizontal: 16, flexGrow: 1 },
  listBottomPad: { height: 100 },
  groupItemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  groupItemCardDragging: {
    borderColor: Colors.textMuted,
  },
  groupItemGap: { height: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingRight: 14, paddingLeft: 8 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  dragHandle: { paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  dragHandleSpacer: { width: 34 },
  groupIconOuter: {
    width: 46,
    height: 46,
    borderRadius: groupAvatarBorderRadius(44) + 1,
    padding: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupIconInner: {
    width: 44,
    height: 44,
    borderRadius: groupAvatarBorderRadius(44),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
  },
  groupName: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.text, marginBottom: 2 },
  groupMeta: { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  groupAnnouncementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    minWidth: 0,
  },
  groupAnnouncementText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: '#92400E',
    lineHeight: 18,
  },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adminBadgeText: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textSub },
  myEmpty: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 24, paddingBottom: 8 },
  emptyGlyph: { marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 6 },
  emptyDesc: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
});
