import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PollsService, type PollInput } from '@moijia/client';
import { queryKeys } from '../../config/queryClient';

export function usePoll(id: string, userId: string) {
  return useQuery({
    queryKey: queryKeys.polls.detail(id, userId),
    queryFn: () => PollsService.getPoll(id, userId),
    enabled: Boolean(id?.trim() && userId?.trim()),
  });
}

export function useCreatePoll(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PollInput) => {
      if (!userId) throw new Error('Not signed in');
      return PollsService.createPoll(userId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['polls'] });
    },
  });
}
