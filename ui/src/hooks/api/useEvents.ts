import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EventsService, type EventInput, type EventUpdate, type EventDetailed } from '@moija/client';
import { queryKeys } from '../../config/queryClient';

interface EventFilters {
  userId: string;
  groupId?: string;
  startAfter?: string;
  startBefore?: string;
  limit?: number;
}

export function useEvents(filters: EventFilters) {
  return useQuery<EventDetailed[]>({
    queryKey: queryKeys.events.list(filters),
    queryFn: () =>
      EventsService.getEvents(
        filters.userId,
        filters.groupId,
        filters.startAfter,
        filters.startBefore,
        filters.limit
      ),
    enabled: !!filters.userId,
    staleTime: 0,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
  });
}

export function useEvent(id: string, userId: string) {
  return useQuery({
    queryKey: queryKeys.events.detail(id, userId),
    queryFn: () => EventsService.getEvent(id, userId),
    enabled: !!id && !!userId,
    staleTime: 0,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: EventInput) => EventsService.createEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useUpdateEvent(id: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: EventUpdate) => EventsService.updateEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => EventsService.deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
