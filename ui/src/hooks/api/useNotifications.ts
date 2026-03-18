import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotificationsService, type NotificationInput } from '@boltup/client';
import { queryKeys } from '../../config/queryClient';

export function useNotifications(userId?: string) {
  return useQuery({
    queryKey: userId ? queryKeys.notifications.user(userId) : queryKeys.notifications.all,
    queryFn: async () => {
      console.log('[Notifications] Fetching notifications at', new Date().toLocaleTimeString());
      const result = await NotificationsService.getNotifications(userId);
      console.log('[Notifications] Received', result.length, 'notifications');
      return result;
    },
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache
    refetchInterval: 5000, // Poll every 5 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
  });
}

export function useCreateNotification() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: NotificationInput) => NotificationsService.createNotification(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useUpdateNotification() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => 
      NotificationsService.updateNotification(id, { read }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userId: string) => 
      NotificationsService.markAllAsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
