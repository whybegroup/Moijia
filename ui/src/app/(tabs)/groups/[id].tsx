import { useMemo, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GroupDetailView } from '../../../components/GroupDetailView';
import { useGroups } from '../../../hooks/api';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';
import { firstSearchParam, parseReturnToParam } from '../../../utils/navigationReturn';

export default function GroupsTabGroupDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; returnTo?: string | string[] }>();
  const { userId: currentUserId } = useCurrentUserContext();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const returnToHref = useMemo(
    () => parseReturnToParam(firstSearchParam(params.returnTo)),
    [params.returnTo]
  );

  const { data: allGroups = [] } = useGroups(currentUserId ?? '', true);
  const listGroups = useMemo(
    () =>
      allGroups.filter(
        (g) =>
          g.membershipStatus === 'member' ||
          g.membershipStatus === 'admin' ||
          g.membershipStatus === 'pending'
      ),
    [allGroups]
  );

  const switchableGroups = useMemo(
    () =>
      listGroups
        .filter((g) => g.id !== groupId)
        .map((g) => ({ id: g.id, name: g.name })),
    [listGroups, groupId]
  );

  const onSwitchGroup = useCallback(
    (nextId: string) => {
      const rt = firstSearchParam(params.returnTo);
      const q = rt ? `?returnTo=${encodeURIComponent(rt)}` : '';
      router.replace(`/(tabs)/groups/${nextId}${q}`);
    },
    [router, params.returnTo]
  );

  if (!groupId) {
    return null;
  }

  return (
    <GroupDetailView
      groupId={groupId}
      returnToHref={returnToHref}
      switchableGroups={switchableGroups}
      onSwitchGroup={onSwitchGroup}
    />
  );
}
