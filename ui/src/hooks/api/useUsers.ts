import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { UsersService, UserInput, UserUpdate } from '@moija/client';
import { queryKeys } from '../../config/queryClient';

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: () => UsersService.getUsers(),
    staleTime: 0,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
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
