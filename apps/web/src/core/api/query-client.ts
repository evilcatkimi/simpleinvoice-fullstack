import { type DefaultOptions, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

/**
 * Retry once on network errors and 5xx. 4xx answers are deterministic: a bad request, a missing
 * invoice or an expired session will not fix themselves on a second attempt.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(overrides: DefaultOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      ...overrides,
      queries: {
        // Invoices change rarely and only through this app; avoid refetching on every mount.
        staleTime: 30_000,
        retry: shouldRetry,
        ...overrides.queries,
      },
    },
  });
}
