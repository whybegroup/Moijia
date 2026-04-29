import { ApiError } from '@moijia/client';

export function isNotFoundError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 404;
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status?: unknown }).status;
    return s === 404;
  }
  return false;
}

/**
 * For React Query `refetchInterval`: stop polling while the query is in error.
 * Covers 404 plus any case where `error` is not shaped like ApiError (e.g. duplicate bundles).
 */
export function refetchIntervalUnlessNotFound(ms: number) {
  return (query: { state: { status: string } }) => (query.state.status === 'error' ? false : ms);
}

/** For React Query `retry`: do not retry missing resources. */
export function retryUnlessNotFound(failureCount: number, error: unknown): boolean {
  if (isNotFoundError(error)) return false;
  return failureCount < 3;
}
