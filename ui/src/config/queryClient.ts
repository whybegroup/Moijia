import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

export const queryKeys = {
  users: {
    all: ['users'] as const,
    detail: (id: string) => ['users', id] as const,
  },
  groups: {
    _base: ['groups'] as const,
    all: (userId: string, includeDeleted?: boolean) => ['groups', userId, includeDeleted ?? false] as const,
    detail: (id: string, userId: string) => ['groups', 'detail', id, userId] as const,
    members: (id: string) => ['groups', id, 'members'] as const,
    pendingRequests: (id: string) => ['groups', id, 'requests', 'pending'] as const,
    memberColor: (groupId: string, userId: string) => ['groups', groupId, 'members', userId, 'color'] as const,
    memberNotifPrefs: (groupId: string, userId: string) =>
      ['groups', groupId, 'members', userId, 'notification-preferences'] as const,
    allMemberColors: (userId: string) => ['groups', 'members', userId, 'colors'] as const,
  },
  events: {
    all: (userId: string) => ['events', userId] as const,
    list: (filters?: Record<string, any>) => ['events', 'list', filters] as const,
    detail: (id: string, userId: string) => ['events', id, userId] as const,
    comments: (id: string) => ['events', id, 'comments'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    user: (userId: string) => ['notifications', 'user', userId] as const,
  },
  polls: {
    detail: (id: string, userId: string) => ['polls', id, userId] as const,
  },
} as const;
