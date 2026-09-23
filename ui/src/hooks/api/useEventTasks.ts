import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  EventsService,
  type EventDetailed,
  type EventTask,
  type EventTaskInput,
  type EventTaskUpdate,
} from '@moijia/client';
import { queryKeys } from '../../config/queryClient';

function detailKey(eventId: string, userId: string) {
  return queryKeys.events.detail(eventId, userId);
}

function patchEventTasks(
  queryClient: QueryClient,
  eventId: string,
  userId: string,
  map: (tasks: EventTask[]) => EventTask[],
) {
  const key = detailKey(eventId, userId);
  queryClient.setQueryData<EventDetailed | null>(key, (old) => {
    if (!old) return old;
    return { ...old, tasks: map(old.tasks ?? []) };
  });
}

function invalidateEvent(queryClient: QueryClient, eventId: string, userId: string) {
  queryClient.invalidateQueries({ queryKey: ['events'] });
  queryClient.invalidateQueries({ queryKey: detailKey(eventId, userId) });
}

export function useCreateEventTask(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EventTaskInput) => EventsService.createTask(eventId, data),
    onSuccess: (task) => {
      patchEventTasks(queryClient, eventId, userId, (tasks) =>
        tasks.some((t) => t.id === task.id) ? tasks : [...tasks, task],
      );
      invalidateEvent(queryClient, eventId, userId);
    },
  });
}

export function useUpdateEventTask(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: EventTaskUpdate }) =>
      EventsService.updateTask(eventId, taskId, input),
    onMutate: async ({ taskId, input }) => {
      const key = detailKey(eventId, userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<EventDetailed | null>(key);
      patchEventTasks(queryClient, eventId, userId, (tasks) =>
        tasks.map((t) => {
          if (t.id !== taskId) return t;
          const next: EventTask = { ...t };
          if (input.title !== undefined) next.title = input.title;
          if (input.assigneeId !== undefined) next.assigneeId = input.assigneeId;
          if (input.completed !== undefined) {
            next.completed = input.completed;
            next.completedBy = input.completed ? userId : null;
            next.completedAt = input.completed ? new Date().toISOString() : null;
          }
          return next;
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(detailKey(eventId, userId), ctx.previous);
      }
    },
    onSettled: () => invalidateEvent(queryClient, eventId, userId),
  });
}

export function useDeleteEventTask(eventId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => EventsService.deleteTask(eventId, taskId, userId),
    onMutate: async (taskId) => {
      const key = detailKey(eventId, userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<EventDetailed | null>(key);
      patchEventTasks(queryClient, eventId, userId, (tasks) => tasks.filter((t) => t.id !== taskId));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(detailKey(eventId, userId), ctx.previous);
      }
    },
    onSettled: () => invalidateEvent(queryClient, eventId, userId),
  });
}
