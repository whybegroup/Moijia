import { useMutation, useQuery, useQueryClient, keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { GroupsService, type GroupInput, type GroupUpdate, type MembershipRequestAction } from '@boltup/client';
import { queryKeys } from '../../config/queryClient';

const PUBLIC_GROUPS_PAGE_SIZE = 10;

export function usePublicGroupsInfinite(
  userId: string | undefined,
  q: string,
  includeJoined: boolean
) {
  return useInfiniteQuery({
    queryKey: queryKeys.groups.public(userId ?? '', q, includeJoined),
    queryFn: ({ pageParam }) =>
      GroupsService.getPublicGroups(userId!, PUBLIC_GROUPS_PAGE_SIZE, pageParam, q || undefined, includeJoined),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      const next = (lastPageParam as number) + lastPage.items.length;
      return next < lastPage.total ? next : undefined;
    },
    enabled: !!userId?.trim(),
  });
}

export function useGroups(userId: string, includeDeleted = false) {
  return useQuery({
    queryKey: queryKeys.groups.all(userId, includeDeleted),
    queryFn: () => GroupsService.getGroups(userId, includeDeleted),
    enabled: !!userId,
    refetchInterval: 3000, // Poll every 3s so changes (e.g. declined request) appear without refresh
    placeholderData: keepPreviousData, // Avoid flicker when toggling includeDeleted
  });
}

export function useGroup(id: string, userId: string) {
  return useQuery({
    queryKey: queryKeys.groups.detail(id, userId),
    queryFn: () => GroupsService.getGroup(id, userId),
    enabled: !!id && !!userId,
    refetchInterval: 3000,
  });
}

export function useGroupMembers(id: string, userId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.groups.members(id),
    queryFn: () => GroupsService.getGroupMembers(id, userId),
    enabled: opts?.enabled !== false && !!id && !!userId,
    refetchInterval: 3000, // Poll so member list and avatars stay fresh
  });
}

export function useCreateGroup(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GroupInput) => GroupsService.createGroup(data),
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
      if (data.thumbnail === undefined && data.avatarSeed === undefined) return;
      const detailKey = queryKeys.groups.detail(id, userId);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const prev = queryClient.getQueryData(detailKey);
      queryClient.setQueryData(detailKey, (old: any) =>
        old ? { ...old, ...(data.thumbnail !== undefined && { thumbnail: data.thumbnail }), ...(data.avatarSeed !== undefined && { avatarSeed: data.avatarSeed }) } : old
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

export function usePendingRequests(id: string, userId: string) {
  return useQuery({
    queryKey: queryKeys.groups.pendingRequests(id),
    queryFn: () => GroupsService.getPendingRequests(id, userId),
    enabled: !!id && !!userId,
    refetchInterval: 3000, // Poll every 3s to pick up new join requests
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

export function useSetSuperAdmin(groupId: string, performedBy: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      GroupsService.setSuperAdmin(groupId, { performedBy, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId, performedBy) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.members(groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
    },
  });
}

export function useGroupMemberColor(groupId: string, userId: string) {
  return useQuery({
    queryKey: queryKeys.groups.memberColor(groupId, userId),
    queryFn: () => GroupsService.getMemberColor(groupId, userId),
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

export function useAllGroupMemberColors(userId: string) {
  return useQuery({
    queryKey: queryKeys.groups.allMemberColors(userId),
    queryFn: () => GroupsService.getAllMemberColors(userId),
    enabled: !!userId,
  });
}
