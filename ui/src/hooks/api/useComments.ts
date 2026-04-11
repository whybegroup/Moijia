import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EventsService,
  CommentsService,
  type CommentInput,
  type CommentUpdateInput,
} from '@moija/client';
import { queryKeys } from '../../config/queryClient';

export function useEventComments(eventId: string) {
  return useQuery({
    queryKey: queryKeys.events.comments(eventId),
    queryFn: () => EventsService.getComments(eventId),
    enabled: !!eventId,
  });
}

export function useCreateComment(eventId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CommentInput) => EventsService.createComment(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.comments(eventId) });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useDeleteComment(eventId: string, viewerUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, actorId }: { commentId: string; actorId: string }) =>
      CommentsService.deleteComment(commentId, actorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.comments(eventId) });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      const uid = viewerUserId?.trim();
      if (uid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId, uid) });
      }
    },
  });
}

export function useUpdateComment(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: CommentUpdateInput }) =>
      CommentsService.updateComment(commentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.comments(eventId) });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
