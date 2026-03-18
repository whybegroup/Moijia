import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GroupsService, type GroupInput, type GroupUpdate, type MembershipRequestAction } from '@boltup/client';
import { queryKeys } from '../../config/queryClient';

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups.all,
    queryFn: () => GroupsService.getGroups(),
  });
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: queryKeys.groups.detail(id),
    queryFn: () => GroupsService.getGroup(id),
    enabled: !!id,
  });
}

export function useGroupMembers(id: string) {
  return useQuery({
    queryKey: queryKeys.groups.members(id),
    queryFn: () => GroupsService.getGroupMembers(id),
    enabled: !!id,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: GroupInput) => GroupsService.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    },
  });
}

export function useUpdateGroup(id: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: GroupUpdate) => GroupsService.updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => GroupsService.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    },
  });
}

export function usePendingRequests(id: string) {
  return useQuery({
    queryKey: queryKeys.groups.pendingRequests(id),
    queryFn: () => GroupsService.getPendingRequests(id),
    enabled: !!id,
  });
}

export function useHandleMembershipRequest(id: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: MembershipRequestAction) => GroupsService.handleMembershipRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.pendingRequests(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.members(id) });
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
