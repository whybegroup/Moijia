import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EventsService,
  CommentsService,
  type CommentInput,
  type CommentUpdateInput,
  type CommentDeleteInput,
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

export function useDeleteComment(eventId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: CommentDeleteInput }) =>
      CommentsService.deleteComment(commentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.comments(eventId) });
      queryClient.invalidateQueries({ queryKey: ['events'] });
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
