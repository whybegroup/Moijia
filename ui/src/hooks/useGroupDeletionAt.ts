import { useMemo } from 'react';
import { useOwnedGroupQuota } from './api/useUsers';
import { useListGroups } from './useListGroups';
import { downgradeIsPending, pendingDowngradeAt } from '../utils/downgradePlan';
import { FREE_OWNED_GROUP_LIMIT } from '../utils/groupTiers';

/** Date this group will be deleted, using the owner's current My Groups order when they are the viewer. */
export function useGroupDeletionAt(
  userId: string | undefined,
  groupId: string,
  serverDeletionAt?: string | null
): string | null {
  const { listGroups } = useListGroups(userId ?? '', false);
  const { data: quota } = useOwnedGroupQuota(userId ?? '');
  return useMemo(() => {
    const pending = downgradeIsPending(quota);
    const owned = userId ? listGroups.filter((group) => group.ownerId === userId && !group.deletedAt) : [];
    const viewerOwns = owned.some((group) => group.id === groupId);
    if (viewerOwns && pending) {
      const removed = owned.slice(FREE_OWNED_GROUP_LIMIT).some((group) => group.id === groupId);
      if (!removed) return null;
      return serverDeletionAt ?? pendingDowngradeAt(quota)?.toISOString() ?? 'pending';
    }
    return serverDeletionAt ?? null;
  }, [groupId, listGroups, quota, serverDeletionAt, userId]);
}
