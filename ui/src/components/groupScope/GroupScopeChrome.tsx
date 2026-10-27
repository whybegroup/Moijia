import { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppRouter as useRouter } from '../../hooks/useAppRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';
import { useGroups, useNotifications, useAllGroupMemberColors } from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { useOrderedSwitcherGroups } from '../../hooks/useOrderedSwitcherGroups';
import { GroupsTopHeader } from '../GroupsTopHeader';
import { GroupsBreadcrumbTrail } from '../GroupsBreadcrumbTrail';
import { NotificationsPanelModal } from '../NotificationsPanelModal';
import { CreateOrJoinButton } from '../CreateOrJoinButton';
import { useGroupScopeHeaderSlot, useGroupScopeNav } from './GroupScopeNavContext';
import { useGroupSubpage } from './useGroupSubpage';
import { useGroupScopeBreadcrumbs } from './useGroupScopeBreadcrumbs';
import { getGroupColor, getDefaultGroupThemeFromName } from '../../utils/helpers';

type GroupScopeChromeProps = {
  /** When null, breadcrumbs show the All Groups list (no group scope). */
  groupId: string | null;
};

/**
 * Single top bar + breadcrumb strip for the entire Groups tab.
 * Stack screens below must not render their own headers.
 */
export function GroupScopeChrome({ groupId }: GroupScopeChromeProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  const { orderedSwitcherGroups } = useOrderedSwitcherGroups(currentUserId ?? '');

  const { optimisticSubpage } = useGroupScopeNav();
  const pathnameSubpage = useGroupSubpage(groupId ?? '');
  const subpage = groupId
    ? (optimisticSubpage ?? pathnameSubpage)
    : ({ kind: 'overview' as const });
  const onSwitchGroup = useCallback(
    (nextId: string) => {
      if (groupId && nextId === groupId) return;
      router.replace(`/(tabs)/groups/${nextId}` as never);
    },
    [router, groupId]
  );

  const groupBreadcrumbs = useGroupScopeBreadcrumbs(
    groupId ?? '',
    subpage,
    orderedSwitcherGroups,
    onSwitchGroup,
    { enabled: !!groupId }
  );

  const listSegments = useMemo(() => [{ label: 'Groups' }], []);

  const segments = groupId ? groupBreadcrumbs.segments : listSegments;
  const groupSwitchModal = groupId ? groupBreadcrumbs.groupSwitchModal : null;
  const activitySectionSwitchModal = groupId ? groupBreadcrumbs.activitySectionSwitchModal : null;

  const { data: allGroupsForChrome = [] } = useGroups(currentUserId ?? '', true);
  const { data: notifs = [], isLoading: notifsLoading } = useNotifications(currentUserId || '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const [showNotifs, setShowNotifs] = useState(false);

  const unreadNotifCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);
  const eventEligibleGroupCount = useMemo(
    () =>
      allGroupsForChrome.filter(
        (g) => !g.deletedAt && (g.membershipStatus === 'member' || g.membershipStatus === 'admin')
      ).length,
    [allGroupsForChrome]
  );
  const { headerTrailing } = useGroupScopeHeaderSlot();
  const showDetailActions =
    subpage.kind === 'poll' || subpage.kind === 'event' || subpage.kind === 'overview';
  const createAction = !groupId
    ? { mode: 'group' as const, groupId: undefined as string | undefined }
    : subpage.kind === 'events'
      ? { mode: 'event' as const, groupId }
      : subpage.kind === 'polls'
        ? { mode: 'poll' as const, groupId }
        : null;
  const groupHeaderTheme = useMemo(() => {
    if (!groupId) return null;
    const group = allGroupsForChrome.find((g) => g.id === groupId);
    const hex = groupColors[groupId] || getDefaultGroupThemeFromName(group?.name ?? 'Group');
    const p = getGroupColor(hex);
    return { backgroundColor: p.row, borderBottomColor: p.label };
  }, [groupId, groupColors, allGroupsForChrome]);

  return (
    <>
      <View
        collapsable={false}
        style={[
          styles.chrome,
          { paddingTop: insets.top },
          {
            backgroundColor: groupHeaderTheme?.backgroundColor ?? Colors.bg,
          },
        ]}
      >
        <GroupsTopHeader
          showNotifs={showNotifs}
          onToggleNotifs={() => setShowNotifs((p) => !p)}
          unreadCount={unreadNotifCount}
          trailingActions={showDetailActions ? headerTrailing : undefined}
          createAction={
            createAction ? (
              <CreateOrJoinButton
                userId={currentUserId}
                eventEligibleGroupCount={eventEligibleGroupCount}
                mode={createAction.mode}
                groupId={createAction.groupId}
                variant="header"
              />
            ) : undefined
          }
          headerTheme={groupHeaderTheme}
        />
        <GroupsBreadcrumbTrail segments={segments} />
      </View>
      {groupSwitchModal}
      {activitySectionSwitchModal}
      <NotificationsPanelModal
        visible={showNotifs}
        onClose={() => setShowNotifs(false)}
        userId={currentUserId || ''}
        notifications={notifs}
        isLoading={notifsLoading}
        groups={allGroupsForChrome.map((g) => ({ id: g.id, name: g.name }))}
        groupColors={groupColors}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chrome: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: Colors.bg,
  },
});
