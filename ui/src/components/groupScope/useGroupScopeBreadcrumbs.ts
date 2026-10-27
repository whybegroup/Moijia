import { useMemo, useCallback } from 'react';
import { type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../../hooks/useAppRouter';
import type { BreadcrumbSegment } from '../GroupsBreadcrumbTrail';
import { useGroup, usePoll, useEvent } from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { useGroupsBreadcrumbGroupSwitch } from '../groupsBreadcrumbDropdown';
import { useGroupsActivitySectionSwitch, type GroupsActivitySection } from '../GroupsActivitySectionSwitch';
import { breadcrumbTruncate } from '../../utils/helpers';
import { ALL_GROUPS_HREF, navigateGroupsTabTo } from '../../utils/tabBreadcrumbNav';
import { GROUP_STORAGE_CATEGORY_LABELS } from '../../utils/groupStorageCategories';
import { groupIdFromPathname } from './groupIdFromPathname';
import { useGroupScopeNav } from './GroupScopeNavContext';
import type { GroupSubpage } from './useGroupSubpage';

const SUBPAGE_LABEL: Partial<Record<GroupSubpage['kind'], string>> = {
  members: 'Members',
  settings: 'Settings',
  storage: 'Media',
};

function activitySectionForSubpage(subpage: GroupSubpage): GroupsActivitySection | null {
  if (subpage.kind === 'events') return 'events';
  if (subpage.kind === 'polls' || subpage.kind === 'poll') return 'polls';
  if (subpage.kind === 'event') return 'events';
  if (subpage.kind === 'posts') return 'posts';
  return null;
}

function isOnActivitySectionRoot(subpage: GroupSubpage, section: GroupsActivitySection): boolean {
  if (section === 'events') return subpage.kind === 'events';
  if (section === 'polls') return subpage.kind === 'polls';
  return subpage.kind === 'posts';
}

type UseGroupScopeBreadcrumbsOptions = {
  enabled?: boolean;
};

export function useGroupScopeBreadcrumbs(
  groupId: string,
  subpage: GroupSubpage,
  orderedSwitcherGroups: { id: string; name: string }[],
  onSwitchGroup: (nextId: string) => void,
  options?: UseGroupScopeBreadcrumbsOptions
) {
  const enabled = options?.enabled !== false && !!groupId;
  const router = useRouter();
  const navCallbacks = useGroupScopeNav();
  const { userId: currentUserId } = useCurrentUserContext();
  const { data: group } = useGroup(groupId, currentUserId ?? '', { enabled });
  const switcherGroup = orderedSwitcherGroups.find((g) => g.id === groupId);
  const groupForChrome = group ?? (switcherGroup ? { id: groupId, name: switcherGroup.name } : null);
  const pollId = subpage.kind === 'poll' ? subpage.pollId : undefined;
  const eventId = subpage.kind === 'event' ? subpage.eventId : undefined;
  const { data: poll } = usePoll(pollId ?? '', currentUserId ?? '');
  const { data: event } = useEvent(eventId ?? '', currentUserId ?? '');

  const goToAllGroups = useCallback(() => {
    navigateGroupsTabTo(router, ALL_GROUPS_HREF, groupId, navCallbacks);
  }, [router, groupId, navCallbacks]);

  const navigateTo = useCallback(
    (target: Href) => {
      navigateGroupsTabTo(router, target, groupId, navCallbacks);
    },
    [router, groupId, navCallbacks]
  );

  const { chevronProps: groupChevronProps, modal: groupSwitchModal } = useGroupsBreadcrumbGroupSwitch(
    groupForChrome,
    orderedSwitcherGroups,
    onSwitchGroup
  );

  const activitySection = activitySectionForSubpage(subpage);
  const onActivitySectionRoot =
    activitySection != null && isOnActivitySectionRoot(subpage, activitySection);
  const { segment: activitySectionSegment, modal: activitySectionSwitchModal } =
    useGroupsActivitySectionSwitch(groupId, activitySection ?? 'events', {
      isOnSectionRoot: onActivitySectionRoot,
    });

  const segments: BreadcrumbSegment[] = useMemo(() => {
    if (!enabled) {
      return [{ label: 'Groups' }];
    }
    if (!groupForChrome) {
      return [{ label: 'Groups', onPress: goToAllGroups }];
    }

    const out: BreadcrumbSegment[] = [
      { label: 'Groups', onPress: goToAllGroups },
      {
        label: groupForChrome.name,
        ...(subpage.kind !== 'overview'
          ? { onPress: () => navigateTo(`/(tabs)/groups/${groupId}` as Href) }
          : {}),
        ...groupChevronProps,
      },
    ];

    if (activitySection) {
      out.push(activitySectionSegment);
      if (subpage.kind === 'poll') {
        const pollLabel = breadcrumbTruncate(poll?.title?.trim() ? poll.title : 'Poll');
        out.push({ label: pollLabel });
      }
      if (subpage.kind === 'event') {
        const eventLabel = breadcrumbTruncate(event?.name?.trim() ? event.name : 'Event');
        out.push({ label: eventLabel });
      }
      return out;
    }

    if (subpage.kind === 'storage-category') {
      out.push({
        label: 'Media',
        onPress: () => navigateTo(`/(tabs)/groups/${groupId}/storage` as Href),
      });
      out.push({ label: GROUP_STORAGE_CATEGORY_LABELS[subpage.category] });
      return out;
    }

    const extra = SUBPAGE_LABEL[subpage.kind];
    if (extra) out.push({ label: extra });

    return out;
  }, [
    enabled,
    groupForChrome,
    groupId,
    goToAllGroups,
    navigateTo,
    groupChevronProps,
    activitySection,
    activitySectionSegment,
    subpage.kind,
    poll?.title,
    event?.name,
    subpage.kind === 'storage-category' ? subpage.category : undefined,
  ]);

  return {
    segments,
    groupSwitchModal: enabled ? groupSwitchModal : null,
    activitySectionSwitchModal:
      enabled && activitySection ? activitySectionSwitchModal : null,
  };
}
