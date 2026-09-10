import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  GroupsService,
  UsersService,
  type GroupInput,
  type GroupUpdate,
  type GroupScoped,
  type MembershipRequestAction,
  type Partial_NotifPrefs_,
  GroupStorageLimitInput,
} from '@moijia/client';
import { reorderGroupsInCache } from '../../utils/groupOrder';
import { queryKeys } from '../../config/queryClient';
import { retryUnlessNotFound } from '../../utils/apiErrors';

/** Reuse list data so group detail can render without waiting on a duplicate GET /groups/:id. */
function readGroupScopedFromCaches(
  queryClient: QueryClient,
  userId: string,
  groupId: string
): GroupScoped | undefined {
  for (const includeDeleted of [false, true] as const) {
    const list = queryClient.getQueryData<GroupScoped[]>(queryKeys.groups.all(userId, includeDeleted));
    const hit = list?.find((g) => g.id === groupId);
    if (hit) return hit;
  }
  return undefined;
}

export function useGroups(userId: string, includeDeleted = false) {
  return useQuery({
    queryKey: queryKeys.groups.all(userId, includeDeleted),
    queryFn: () => GroupsService.getGroups(userId, includeDeleted),
    enabled: !!userId,
    placeholderData: keepPreviousData, // Avoid flicker when toggling includeDeleted
  });
}

export function useGroup(id: string, userId: string, opts?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.groups.detail(id, userId),
    queryFn: () => GroupsService.getGroup(id, userId),
    enabled: (opts?.enabled ?? true) && !!id && !!userId,
    retry: retryUnlessNotFound,
    placeholderData: (previousData) => {
      const fromList = readGroupScopedFromCaches(queryClient, userId, id);
      if (fromList) return fromList;
      if (previousData && previousData.id === id) return previousData;
      return undefined;
    },
  });
}

export function useGroupMembers(id: string, userId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.groups.members(id),
    queryFn: () => GroupsService.getGroupMembers(id, userId),
    enabled: opts?.enabled !== false && !!id && !!userId,
    retry: retryUnlessNotFound,
  });
}

export function useUpdateGroupOrder(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupIds: string[]) =>
      UsersService.setGroupOrder(userId, { groupIds }),
    onMutate: async (groupIds) => {
      const key = queryKeys.groups.all(userId, true);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<GroupScoped[]>(key);
      if (prev) {
        queryClient.setQueryData(key, reorderGroupsInCache(prev, groupIds));
      }
      const keyNoDeleted = queryKeys.groups.all(userId, false);
      const prevNoDeleted = queryClient.getQueryData<GroupScoped[]>(keyNoDeleted);
      if (prevNoDeleted) {
        queryClient.setQueryData(keyNoDeleted, reorderGroupsInCache(prevNoDeleted, groupIds));
      }
      return { prev, prevNoDeleted };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.groups.all(userId, true), ctx.prev);
      }
      if (ctx?.prevNoDeleted) {
        queryClient.setQueryData(queryKeys.groups.all(userId, false), ctx.prevNoDeleted);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GroupInput) => GroupsService.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useRegenerateInviteCode(groupId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => GroupsService.regenerateInviteCode(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useUpdateGroup(id: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GroupUpdate) => GroupsService.updateGroup(id, userId, data),
    onMutate: async (data) => {
      if (
        data.thumbnail === undefined &&
        data.avatarSeed === undefined &&
        data.coverPhotos === undefined &&
        data.announcement === undefined
      )
        return;
      const detailKey = queryKeys.groups.detail(id, userId);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const prev = queryClient.getQueryData(detailKey);
      queryClient.setQueryData(detailKey, (old: any) =>
        old
          ? {
              ...old,
              ...(data.thumbnail !== undefined && { thumbnail: data.thumbnail }),
              ...(data.avatarSeed !== undefined && { avatarSeed: data.avatarSeed }),
              ...(data.coverPhotos !== undefined && { coverPhotos: data.coverPhotos }),
              ...(data.announcement !== undefined && { announcement: data.announcement }),
            }
          : old
      );
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.groups.detail(id, userId), ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useSetGroupStorageLimit(groupId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sizeTier: 'medium' | 'large') =>
      GroupsService.setGroupStorageLimit(groupId, userId, {
        sizeTier:
          sizeTier === 'large'
            ? GroupStorageLimitInput.sizeTier.LARGE
            : GroupStorageLimitInput.sizeTier.MEDIUM,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.storageBreakdown(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId, userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useCancelGroupStorageSubscription(groupId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => GroupsService.cancelStorageSubscription(groupId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.storageBreakdown(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId, userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useGroupStorageBreakdown(groupId: string, userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.groups.storageBreakdown(groupId),
    queryFn: () => GroupsService.getStorageBreakdown(groupId, userId),
    enabled: enabled && !!groupId && !!userId,
    retry: retryUnlessNotFound,
  });
}

export function useGroupStorageFiles(groupId: string, category: string, userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.groups.storageFiles(groupId, category),
    queryFn: () => GroupsService.getStorageFiles(groupId, category, userId),
    enabled: enabled && !!groupId && !!category && !!userId,
    retry: retryUnlessNotFound,
  });
}

export function useDeleteGroupStorageFile(groupId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (urls: string | string[]) => {
      const list = Array.isArray(urls) ? urls : [urls];
      for (const url of list) {
        await GroupsService.deleteStorageFile(groupId, userId, { url });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.storageBreakdown(groupId) });
      queryClient.invalidateQueries({ queryKey: ['groups', groupId, 'storage-files'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId, userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.posts(groupId, userId) });
    },
  });
}

export function useDeleteGroup(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => GroupsService.deleteGroup(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useSoftDeleteGroup(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => GroupsService.softDeleteGroup(groupId, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useRecoverGroup(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => GroupsService.recoverGroup(groupId, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function usePendingRequests(id: string, userId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.groups.pendingRequests(id),
    queryFn: () => GroupsService.getPendingRequests(id, userId),
    enabled: opts?.enabled !== false && !!id && !!userId,
    retry: retryUnlessNotFound,
  });
}

export function useLeaveGroup(options?: { onError?: (err: unknown) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      GroupsService.leaveGroup(groupId, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
    onError: options?.onError,
  });
}

export function useJoinByInviteCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ inviteCode, userId }: { inviteCode: string; userId: string }) =>
      GroupsService.joinByInviteCode({ inviteCode, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      GroupsService.joinGroup(groupId, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['polls'] });
    },
  });
}

export function useHandleMembershipRequest(id: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MembershipRequestAction) => GroupsService.handleMembershipRequest(id, userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(id, userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.members(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.pendingRequests(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useRemoveMember(groupId: string, performedBy: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) =>
      GroupsService.removeMember(groupId, memberId, { performedBy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId, performedBy) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.members(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.pendingRequests(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useSetMemberRole(groupId: string, performedBy: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: 'admin' | 'member' }) =>
      GroupsService.setMemberRole(groupId, memberId, { performedBy, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId, performedBy) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.members(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useSetOwner(groupId: string, performedBy: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      GroupsService.setOwner(groupId, { performedBy, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId, performedBy) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.members(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useGroupMemberColor(groupId: string, userId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.groups.memberColor(groupId, userId),
    queryFn: async () => {
      const batchKey = queryKeys.groups.allMemberColors(userId);
      const batchState = queryClient.getQueryState(batchKey);
      const batch = queryClient.getQueryData<Record<string, string>>(batchKey);
      if (batchState?.status === 'success') {
        return { colorHex: batch?.[groupId] ?? null };
      }
      return GroupsService.getMemberColor(groupId, userId);
    },
    enabled: !!groupId && !!userId,
  });
}

export function useUpdateGroupMemberColor(groupId: string, userId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (colorHex: string) => GroupsService.updateMemberColor(groupId, userId, { colorHex }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.memberColor(groupId, userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.allMemberColors(userId) });
    },
  });
}

export function useGroupMemberNotifPrefs(groupId: string, userId: string) {
  return useQuery({
    queryKey: queryKeys.groups.memberNotifPrefs(groupId, userId),
    queryFn: () => GroupsService.getMemberNotifPrefs(groupId, userId),
    enabled: !!groupId && !!userId,
  });
}

export function useUpdateGroupMemberNotifPrefs(groupId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial_NotifPrefs_) =>
      GroupsService.updateMemberNotifPrefs(groupId, userId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.memberNotifPrefs(groupId, userId) });
    },
  });
}

export function useAllGroupMemberColors(userId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.groups.allMemberColors(userId),
    queryFn: () => GroupsService.getAllMemberColors(userId),
    enabled: !!userId,
  });

  useEffect(() => {
    const data = query.data;
    if (!userId || !data || typeof data !== 'object') return;
    for (const [gid, hex] of Object.entries(data as Record<string, string>)) {
      queryClient.setQueryData(queryKeys.groups.memberColor(gid, userId), {
        colorHex: hex || null,
      });
    }
  }, [userId, query.data, queryClient]);

  return query;
}
