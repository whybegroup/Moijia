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

// Refetch notifications more frequently
queryClient.setQueryDefaults(
  ['notifications'],
  {
    staleTime: 0, // Always consider stale to ensure refetch happens
    refetchInterval: 5000, // Refetch every 5 seconds
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false, // Don't poll when app is in background
  }
);

export const queryKeys = {
  users: {
    all: ['users'] as const,
    detail: (id: string) => ['users', id] as const,
  },
  groups: {
    all: ['groups'] as const,
    detail: (id: string) => ['groups', id] as const,
    members: (id: string) => ['groups', id, 'members'] as const,
    pendingRequests: (id: string) => ['groups', id, 'requests', 'pending'] as const,
    memberColor: (groupId: string, userId: string) => ['groups', groupId, 'members', userId, 'color'] as const,
    allMemberColors: (userId: string) => ['groups', 'members', userId, 'colors'] as const,
  },
  events: {
    all: ['events'] as const,
    list: (filters?: Record<string, any>) => ['events', 'list', filters] as const,
    detail: (id: string) => ['events', id] as const,
    comments: (id: string) => ['events', id, 'comments'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    user: (userId: string) => ['notifications', 'user', userId] as const,
  },
} as const;
