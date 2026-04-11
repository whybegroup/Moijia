import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  EventsService,
  CommentsService,
  type CommentInput,
  type CommentUpdateInput,
} from '@moija/client';
import { queryKeys } from '../../config/queryClient';

export function useEventComments(eventId: string, viewerUserId?: string) {
  return useQuery({
    queryKey: [...queryKeys.events.comments(eventId), viewerUserId ?? ''] as const,
    queryFn: () => EventsService.getComments(eventId, viewerUserId),
    enabled: !!eventId,
  });
}

function invalidateEventCommentCaches(
  queryClient: QueryClient,
  eventId: string,
  viewerUserId?: string | null
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.events.comments(eventId) });
  queryClient.invalidateQueries({ queryKey: ['events'] });
  const uid = viewerUserId?.trim();
  if (uid) {
    queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId, uid) });
  }
}

export function useCreateComment(eventId: string, viewerUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CommentInput) => EventsService.createComment(eventId, data),
    onSuccess: () => invalidateEventCommentCaches(queryClient, eventId, viewerUserId),
  });
}

export function useDeleteComment(eventId: string, viewerUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, actorId }: { commentId: string; actorId: string }) =>
      CommentsService.deleteComment(commentId, actorId),
    onSuccess: () => invalidateEventCommentCaches(queryClient, eventId, viewerUserId),
  });
}

export function useUpdateComment(eventId: string, viewerUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: CommentUpdateInput }) =>
      CommentsService.updateComment(commentId, input),
    onSuccess: () => invalidateEventCommentCaches(queryClient, eventId, viewerUserId),
  });
}

export function useCommentReaction(eventId: string, viewerUserId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) => {
      const uid = viewerUserId?.trim();
      if (!uid) throw new Error('Sign in to react');
      return CommentsService.setCommentReaction(commentId, { userId: uid, emoji });
    },
    onSuccess: () => invalidateEventCommentCaches(queryClient, eventId, viewerUserId),
  });
}
