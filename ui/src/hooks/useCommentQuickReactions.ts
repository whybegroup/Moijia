import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_COMMENT_QUICK_REACTIONS_LIST,
  loadCommentQuickReactions,
} from '../utils/commentQuickReactionsPrefs';

const INITIAL_QUICK_REACTIONS: string[] = [...DEFAULT_COMMENT_QUICK_REACTIONS_LIST];

export function useCommentQuickReactions(userId: string | null | undefined) {
  const uid = userId?.trim() ?? '';
  return useQuery({
    queryKey: ['commentQuickReactions', uid] as const,
    queryFn: () => loadCommentQuickReactions(uid),
    enabled: uid.length > 0,
    initialData: INITIAL_QUICK_REACTIONS,
    staleTime: Infinity,
  });
}
