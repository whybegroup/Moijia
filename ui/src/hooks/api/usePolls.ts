import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PollsService, type Poll, type PollInput, type PollResults } from '@moijia/client';
import { queryKeys } from '../../config/queryClient';

export function usePolls(userId: string) {
  return useQuery<Poll[]>({
    queryKey: queryKeys.polls.list(userId),
    queryFn: () => PollsService.listPolls(userId),
    enabled: !!userId,
  });
}

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

export function usePollResults(id: string, userId: string) {
  return useQuery<PollResults>({
    queryKey: queryKeys.polls.results(id, userId),
    queryFn: () => PollsService.getPollResults(id, userId),
    enabled: Boolean(id?.trim() && userId?.trim()),
  });
}

export function useSubmitPollVote(id: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { optionIds: string[]; textAnswers?: Array<{ questionKey: string; answer: string }> }) => {
      const body: { userId: string; optionIds: string[]; textAnswers?: Array<{ questionKey: string; answer: string }> } = {
        userId,
        optionIds: payload.optionIds,
      };
      if (payload.textAnswers && payload.textAnswers.length > 0) {
        body.textAnswers = payload.textAnswers;
      }
      return PollsService.submitVote(id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.polls.results(id, userId) });
    },
  });
}
