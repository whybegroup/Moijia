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

export function useCreateEvent(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EventInput) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.createEvent(userId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useUpdateEvent(id: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: EventUpdate) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.updateEvent(id, userId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useDeleteEvent(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.deleteEvent(eventId, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
