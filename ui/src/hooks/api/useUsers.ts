import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { UsersService, UserInput, UserUpdate } from '@moijia/client';
import { queryKeys } from '../../config/queryClient';

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: () => UsersService.getUsers(),
    staleTime: 0,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => UsersService.getUser(id),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (user: UserInput) => UsersService.createUser(user),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.setQueryData(queryKeys.users.detail(data.id), data);
    },
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: UserUpdate) => UsersService.updateUser(id, update),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.setQueryData(queryKeys.users.detail(data.id), data);
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => UsersService.deleteUser(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.users.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useOwnedGroupQuota(userId: string) {
  return useQuery({
    queryKey: queryKeys.users.quota(userId),
    queryFn: () => UsersService.getOwnedGroupQuota(userId),
    enabled: !!userId,
  });
}

export function usePurchaseHistory(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.purchases(userId),
    queryFn: () => UsersService.getPurchaseHistory(userId),
    enabled: enabled && !!userId,
  });
}
