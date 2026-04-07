import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EventsService,
  type EventInput,
  type EventUpdate,
  type EventDetailed,
  type EventWatchInput,
  type EventActivityOptionInput,
  type EventActivityVoteInput,
  type EventTimeSuggestionInput,
} from '@moija/client';
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
    refetchIntervalInBackground: true,
  });
}

export function useSetEventWatch(eventId: string, userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: EventWatchInput) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.setEventWatch(eventId, userId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      if (userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId, userId) });
      }
    },
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

/** Update start/end for any event id (e.g. week calendar drag). */
export function useWeekEventTimeMove(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (p: { eventId: string; start: string; end: string }) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.updateEvent(p.eventId, userId, {
        start: p.start,
        end: p.end,
        updatedBy: userId,
      });
    },
    onSuccess: (_data, vars) => {
      invalidateEventQueries(queryClient, vars.eventId, userId);
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

function invalidateEventQueries(queryClient: ReturnType<typeof useQueryClient>, eventId: string, userId: string) {
  queryClient.invalidateQueries({ queryKey: ['events'] });
  queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId, userId) });
}

export function useAddActivityOption(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EventActivityOptionInput) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.addActivityOption(eventId, userId, body);
    },
    onSuccess: () => invalidateEventQueries(queryClient, eventId, userId),
  });
}

export function useDeleteActivityOption(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (optionId: string) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.deleteActivityOption(eventId, optionId, userId);
    },
    onSuccess: () => invalidateEventQueries(queryClient, eventId, userId),
  });
}

export function useSetActivityVote(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EventActivityVoteInput) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.setActivityVote(eventId, userId, body);
    },
    onSuccess: () => invalidateEventQueries(queryClient, eventId, userId),
  });
}

export function useClearActivityVote(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.clearActivityVote(eventId, userId);
    },
    onSuccess: () => invalidateEventQueries(queryClient, eventId, userId),
  });
}

export function useCreateTimeSuggestion(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EventTimeSuggestionInput) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.createTimeSuggestion(eventId, userId, body);
    },
    onSuccess: () => invalidateEventQueries(queryClient, eventId, userId),
  });
}

export function useAcceptTimeSuggestion(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.acceptTimeSuggestion(eventId, suggestionId, userId);
    },
    onSuccess: () => invalidateEventQueries(queryClient, eventId, userId),
  });
}

export function useRejectTimeSuggestion(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) => {
      if (!userId) throw new Error('Not signed in');
      return EventsService.rejectTimeSuggestion(eventId, suggestionId, userId);
    },
    onSuccess: () => invalidateEventQueries(queryClient, eventId, userId),
  });
}
