import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { isApiError } from '@/core/api/api-client';
import { type AuthUser, fetchCurrentUser } from './session-api';

export const sessionKeys = {
  all: ['auth'] as const,
  currentUser: () => [...sessionKeys.all, 'current-user'] as const,
};

/**
 * The signed-in user, or `null` for an anonymous visitor. This cache entry is the single source
 * of truth for "am I logged in?": components read it directly, so they never see a stale copy.
 */
export function currentUserQueryOptions() {
  return queryOptions({
    queryKey: sessionKeys.currentUser(),
    queryFn: async ({ signal }): Promise<AuthUser | null> => {
      try {
        return await fetchCurrentUser(signal);
      } catch (error) {
        // 401 is the expected answer for a visitor without a (valid) session cookie.
        if (isApiError(error, 401)) return null;
        throw error;
      }
    },
    // It only changes through login, logout or a 401, and each of those writes this entry itself.
    staleTime: Infinity,
  });
}

/**
 * Forgets everything cached for the session that just ended — query data and mutations, whose
 * variables hold request bodies such as a customer's details — and marks the visitor anonymous.
 */
export function endSession(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKeys.all[0] });
  queryClient.getMutationCache().clear();
  // Updated rather than removed so mounted observers (route guard, header) re-render right away.
  queryClient.setQueryData(sessionKeys.currentUser(), null);
}
