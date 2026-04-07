import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EventsService, type RSVPInput } from '@moija/client';

export function useCreateOrUpdateRSVP(eventId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: RSVPInput) => EventsService.upsertRsvp(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useDeleteRSVP(eventId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userId: string) => EventsService.deleteRsvp(eventId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
