import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OpenAPI, PollsService, type Poll, type PollInput, type PollResults, type PollWatchInput } from '@moijia/client';
import { queryKeys } from '../../config/queryClient';
import '../../config/apiBase';

/** Works when Metro serves a stale `@moijia/client` bundle without `deletePoll`. */
async function deletePollNetwork(pollId: string, uid: string): Promise<void> {
  const del = (PollsService as unknown as { deletePoll?: (a: string, b: string) => Promise<void> }).deletePoll;
  if (typeof del === 'function') {
    await del(pollId, uid);
    return;
  }
  const base = String(OpenAPI.BASE ?? '').replace(/\/$/, '');
  const url = `${base}/polls/${encodeURIComponent(pollId)}?${new URLSearchParams({ userId: uid }).toString()}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const text = await res.text();
      if (text) {
        try {
          const j = JSON.parse(text) as { error?: string; message?: string };
          detail = (j.message || j.error || text).trim();
        } catch {
          detail = text.trim() || detail;
        }
      }
    } catch {
      /* ignore */
    }
    throw Object.assign(new Error(detail || `Request failed (${res.status})`), { status: res.status });
  }
}

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

export function useSetPollWatch(id: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PollWatchInput) => {
      if (!userId) throw new Error('Not signed in');
      return PollsService.setPollWatch(id, userId, body);
    },
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.polls.detail(id, userId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.polls.list(userId) });
      }
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
      queryClient.invalidateQueries({ queryKey: queryKeys.polls.list(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.polls.detail(id, userId) });
    },
  });
}

export function useDeletePoll(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pollId: string) => {
      if (!userId) throw new Error('Not signed in');
      return deletePollNetwork(pollId, userId);
    },
    onSuccess: (_data, pollId) => {
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.polls.detail(pollId, userId) });
    },
  });
}
