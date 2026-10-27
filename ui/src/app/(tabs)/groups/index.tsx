import {
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useAppRouter as useRouter } from '../../../hooks/useAppRouter';
import { runOnJS } from 'react-native-reanimated';
import {
  NestedReorderableList,
  ScrollViewContainer,
  reorderItems,
  useIsActive,
  useReorderableDrag,
  type ReorderableListRenderItem,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { Colors, Fonts, Radius, Shadows } from '../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../../../utils/helpers';
import { useEvents, useAllGroupMemberColors, useOwnedGroupQuota, useUpdateGroupOrder } from '../../../hooks/api';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';
import { GroupAvatar } from '../../../components/GroupAvatar';
import { useListGroups } from '../../../hooks/useListGroups';
import { usePullToRefresh } from '../../../hooks/usePullToRefresh';
import type { GroupScoped } from '@moijia/client';
import { relocateOwnedGroup } from '../../../utils/groupOrder';
import { downgradeIsPending, pendingDowngradeAt } from '../../../utils/downgradePlan';
import { FREE_OWNED_GROUP_LIMIT } from '../../../utils/groupTiers';
import { formatPlanDate } from '../../../utils/groupPlanPeriod';

type ActiveGroupRowProps = {
  group: GroupScoped;
  groupColors: Record<string, string>;
  events: Array<{ groupId: string; start: string }>;
  now: Date;
  upcomingWeekEnd: Date;
  currentUserId: string | undefined;
  onOpenGroup: (groupId: string) => void;
  moveLabel?: string;
  onMove?: () => void;
  warningNote?: string;
};

function GroupCard({
  group: g,
  groupColors,
  events,
  now,
  upcomingWeekEnd,
  currentUserId,
  onOpenGroup,
  onLongPress,
  isActive = false,
  showHandle,
  moveLabel,
  onMove,
  warningNote,
}: ActiveGroupRowProps & {
  onLongPress?: () => void;
  isActive?: boolean;
  showHandle: boolean;
}) {
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
      onLongPress={isActive ? undefined : onLongPress}
      delayLongPress={120}
      style={[styles.groupItemCard, isActive && styles.groupItemCardDragging, isActive && Shadows.sm]}
      accessibilityRole="button"
      accessibilityLabel={g.name}
      accessibilityHint={showHandle ? 'Hold and drag to reorder' : undefined}
    >
      <View style={styles.row}>
        {showHandle ? (
          <View style={styles.dragHandle} pointerEvents="none">
            <Ionicons name="reorder-three" size={22} color={Colors.textMuted} />
          </View>
        ) : (
          <View style={styles.dragHandleSpacer} />
        )}
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
            {warningNote ? <Text style={styles.warningNote}>{warningNote}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {moveLabel && onMove ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onMove();
                }}
                style={styles.moveBtn}
                accessibilityRole="button"
                accessibilityLabel={`${moveLabel} ${g.name}`}
              >
                <Text style={styles.moveBtnText}>{moveLabel}</Text>
              </Pressable>
            ) : null}
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

function deletionWarning(group: GroupScoped): string | undefined {
  if (!group.deletionScheduledAt) return undefined;
  const date = formatPlanDate(group.deletionScheduledAt);
  return date ? `Will be deleted ${date}` : 'Will be deleted';
}

function DowngradeListNotice({
  choosing,
  when,
  graceStarted,
}: {
  choosing: boolean;
  when: Date | null;
  graceStarted: boolean;
}) {
  const date = when ? formatPlanDate(when) : '';
  const keptLimit = graceStarted
    ? 'Groups under Kept are limited to 1 GB now. New uploads stop once a group is over 1 GB, and older files over that limit are removed on this date.'
    : 'On this date, groups you keep are trimmed to 1 GB, oldest files first.';
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <Text style={styles.noticeTitle}>{date ? `On ${date}` : 'After this plan ends'}</Text>
      <Text style={styles.noticeBody}>
        {choosing
          ? `Only the two groups under Kept stay. Everything under Will be deleted is permanently removed, including its files. Drag a group across the split, or tap Keep or Remove. ${keptLimit} You can still download, delete files, or transfer a group.`
          : graceStarted
            ? 'Groups you own are limited to 1 GB now. New uploads stop once a group is over 1 GB. Older files over that limit are removed on this date. You can still download, delete files, or transfer a group.'
            : 'Groups you own become Small (1 GB). Files over that limit are removed, oldest first.'}
      </Text>
    </View>
  );
}

function DowngradeGroupRow({
  index,
  total,
  ...props
}: ActiveGroupRowProps & { index: number; total: number }) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();
  const keptCount = Math.min(FREE_OWNED_GROUP_LIMIT, total);
  return (
    <View>
      {index === 0 ? <SectionHeader title="Kept" count={String(keptCount)} tone="keep" /> : null}
      {index === FREE_OWNED_GROUP_LIMIT ? (
        <SectionHeader
          title="Will be deleted"
          count={String(total - FREE_OWNED_GROUP_LIMIT)}
          tone="delete"
          spaced
        />
      ) : null}
      <GroupCard
        {...props}
        onLongPress={drag}
        isActive={isActive}
        showHandle
        moveLabel={index < FREE_OWNED_GROUP_LIMIT ? 'Remove' : 'Keep'}
      />
    </View>
  );
}

function ActiveGroupRow(props: ActiveGroupRowProps) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();
  return <GroupCard {...props} onLongPress={drag} isActive={isActive} showHandle />;
}

function GroupItemGap() {
  return <View style={styles.groupItemGap} />;
}

function SectionHeader({
  title,
  count,
  spaced,
  tone,
}: {
  title: string;
  count: string;
  spaced?: boolean;
  tone?: 'keep' | 'delete';
}) {
  return (
    <View style={[styles.sectionHeader, spaced && styles.sectionHeaderSpaced]}>
      <Text
        style={[
          styles.sectionLabel,
          tone === 'keep' && styles.sectionLabelKeep,
          tone === 'delete' && styles.sectionLabelDelete,
        ]}
      >
        {title} ({count})
      </Text>
    </View>
  );
}

function GroupSectionList({
  title,
  count,
  empty,
  spaced,
  tone,
  hideHeader,
  data,
  panGesture,
  renderItem,
  onReorder,
  onDragStart,
  onDragEnd,
  dragLocked,
}: {
  title: string;
  count: string;
  empty: string;
  spaced?: boolean;
  tone?: 'keep' | 'delete';
  hideHeader?: boolean;
  data: GroupScoped[];
  panGesture: PanGesture;
  renderItem: ReorderableListRenderItem<GroupScoped>;
  onReorder: (event: ReorderableListReorderEvent) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragLocked: boolean;
}) {
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const header = useMemo(
    () => (hideHeader ? null : <SectionHeader title={title} count={count} spaced={spaced} tone={tone} />),
    [hideHeader, title, count, spaced, tone]
  );
  const emptyNode = useMemo(() => <Text style={styles.sectionEmpty}>{empty}</Text>, [empty]);

  return (
    <NestedReorderableList
      data={data}
      keyExtractor={(g) => g.id}
      renderItem={renderItem}
      onReorder={onReorder}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      shouldUpdateActiveItem
      panGesture={panGesture}
      cellAnimations={{ opacity: 1, transform: [] }}
      scrollEnabled={false}
      ListHeaderComponent={hideHeader ? undefined : header}
      ListEmptyComponent={data.length === 0 ? emptyNode : null}
      ItemSeparatorComponent={GroupItemGap}
      initialNumToRender={Math.max(data.length, 1)}
      onContentSizeChange={(_width, height) => {
        if (dragLocked || height < 1) return;
        setContentHeight((prev) => (prev != null && Math.abs(prev - height) < 1 ? prev : height));
      }}
      style={contentHeight != null ? { height: contentHeight, flexGrow: 0 } : { flexGrow: 0 }}
    />
  );
}

export default function GroupsScreen() {
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  const [isDragging, setIsDragging] = useState(false);

  const { listGroups, refetch: refetchGroups } = useListGroups(currentUserId ?? '', false);
  const { data: quota, refetch: refetchQuota } = useOwnedGroupQuota(currentUserId ?? '');
  const updateGroupOrder = useUpdateGroupOrder(currentUserId ?? '');
  const myPanGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(520), []);
  const otherPanGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(520), []);
  const { data: events = [], refetch: refetchEvents } = useEvents({
    userId: currentUserId ?? '',
    groupId: undefined,
  });
  const { data: groupColors = {}, refetch: refetchGroupColors } = useAllGroupMemberColors(
    currentUserId || ''
  );
  const { refreshControl } = usePullToRefresh(
    [refetchGroups, refetchEvents, refetchGroupColors, refetchQuota],
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

  const myGroups = useMemo(
    () => orderedActiveGroups.filter((g) => g.ownerId === currentUserId),
    [orderedActiveGroups, currentUserId]
  );
  const otherGroups = useMemo(
    () => orderedActiveGroups.filter((g) => g.ownerId !== currentUserId),
    [orderedActiveGroups, currentUserId]
  );

  const commitOrder = useCallback(
    (prev: GroupScoped[], nextMine: GroupScoped[], nextOthers: GroupScoped[]) => {
      const isOwned = (g: GroupScoped) => g.ownerId === currentUserId;
      let mineIndex = 0;
      let otherIndex = 0;
      const data = prev.map((g) => (isOwned(g) ? nextMine[mineIndex++] : nextOthers[otherIndex++]));
      if (currentUserId && data.length >= 2) {
        updateGroupOrder.mutate(data.map((g) => g.id));
      }
      return data;
    },
    [currentUserId, updateGroupOrder]
  );

  const handleReorder = useCallback(
    (section: 'mine' | 'other', from: number, to: number) => {
      if (from === to) return;
      setOrderedActiveGroups((prev) => {
        const isOwned = (g: GroupScoped) => g.ownerId === currentUserId;
        const mine = prev.filter(isOwned);
        const others = prev.filter((g) => !isOwned(g));
        let nextMine = mine;
        let nextOthers = others;
        if (section === 'other') {
          if (others.length < 2) return prev;
          nextOthers = reorderItems(others, from, to);
        } else {
          if (mine.length < 2) return prev;
          nextMine = reorderItems(mine, from, to);
        }
        return commitOrder(prev, nextMine, nextOthers);
      });
    },
    [commitOrder, currentUserId]
  );

  const moveOwnedGroup = useCallback(
    (groupId: string, toKept: boolean) => {
      setOrderedActiveGroups((prev) => {
        const isOwned = (g: GroupScoped) => g.ownerId === currentUserId;
        const mine = prev.filter(isOwned);
        const others = prev.filter((g) => !isOwned(g));
        const nextMine = relocateOwnedGroup(mine, groupId, toKept, FREE_OWNED_GROUP_LIMIT);
        if (nextMine.every((group, index) => group.id === mine[index]?.id)) return prev;
        return commitOrder(prev, nextMine, others);
      });
    },
    [commitOrder, currentUserId]
  );

  const handleReorderMine = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => handleReorder('mine', from, to),
    [handleReorder]
  );
  const handleReorderOther = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => handleReorder('other', from, to),
    [handleReorder]
  );

  const ownedCountLabel =
    quota == null
      ? String(myGroups.length)
      : quota.groupCapacity == null
        ? `${myGroups.length}/∞`
        : `${myGroups.length}/${quota.groupCapacity}`;

  const now = new Date();
  const upcomingWeekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const openGroup = useCallback(
    (groupId: string) => {
      router.push(`/(tabs)/groups/${groupId}` as import('expo-router').Href);
    },
    [router]
  );

  const rowProps = {
    groupColors,
    events,
    now,
    upcomingWeekEnd,
    currentUserId,
    onOpenGroup: openGroup,
  };

  const downgradePending = downgradeIsPending(quota);
  const keptGroups = downgradePending ? myGroups.slice(0, FREE_OWNED_GROUP_LIMIT) : [];
  const removedGroups = downgradePending ? myGroups.slice(FREE_OWNED_GROUP_LIMIT) : [];
  const choosingKeepers = removedGroups.length > 0;
  const downgradeWhen = pendingDowngradeAt(quota);

  const renderActiveGroupRow = useCallback<ReorderableListRenderItem<GroupScoped>>(
    ({ item: g }) => <ActiveGroupRow group={g} {...rowProps} />,
    [rowProps]
  );
  const renderDowngradeRow = useCallback<ReorderableListRenderItem<GroupScoped>>(
    ({ item: g, index }) => (
      <DowngradeGroupRow
        index={index}
        total={myGroups.length}
        group={g}
        {...rowProps}
        onMove={() => moveOwnedGroup(g.id, index >= FREE_OWNED_GROUP_LIMIT)}
      />
    ),
    [moveOwnedGroup, myGroups.length, rowProps]
  );
  const renderOtherGroupRow = useCallback<ReorderableListRenderItem<GroupScoped>>(
    ({ item: g }) => <ActiveGroupRow group={g} {...rowProps} warningNote={deletionWarning(g)} />,
    [rowProps]
  );

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
      ) : (
        <ScrollViewContainer
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          refreshControl={refreshControl}
        >
          {downgradePending ? (
            <DowngradeListNotice
              choosing={choosingKeepers}
              when={downgradeWhen}
              graceStarted={Boolean(quota?.downgradeAt)}
            />
          ) : null}
          {choosingKeepers ? (
            <GroupSectionList
              title="Kept"
              count={String(keptGroups.length)}
              empty="The top two groups you own stay here."
              hideHeader
              data={myGroups}
              panGesture={myPanGesture}
              renderItem={renderDowngradeRow}
              onReorder={handleReorderMine}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              dragLocked={isDragging}
            />
          ) : (
            <GroupSectionList
              title="My Groups"
              count={ownedCountLabel}
              empty="Groups you create show up here."
              data={myGroups}
              panGesture={myPanGesture}
              renderItem={renderActiveGroupRow}
              onReorder={handleReorderMine}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              dragLocked={isDragging}
            />
          )}
          <GroupSectionList
            title="Other groups"
            count={String(otherGroups.length)}
            empty="You are not in any other groups."
            spaced
            data={otherGroups}
            panGesture={otherPanGesture}
            renderItem={renderOtherGroupRow}
            onReorder={handleReorderOther}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            dragLocked={isDragging}
          />
          <View style={styles.listBottomPad} />
        </ScrollViewContainer>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sectionHeaderSpaced: { marginTop: 18 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionLabelKeep: { color: Colors.going },
  sectionLabelDelete: { color: Colors.notGoing },
  notice: {
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.maybeBg,
    borderWidth: 1,
    borderColor: Colors.maybeBorder,
  },
  noticeTitle: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 6 },
  noticeBody: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.regular, color: Colors.textSub },
  warningNote: { marginTop: 4, fontSize: 12, fontFamily: Fonts.medium, color: Colors.notGoing },
  moveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.bg,
  },
  moveBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.text },
  sectionEmpty: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    marginBottom: 8,
  },
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
