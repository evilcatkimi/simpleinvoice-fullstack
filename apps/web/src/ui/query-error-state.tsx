import type { UseQueryResult } from '@tanstack/react-query';
import { getErrorMessage, isApiError } from '@/core/api/api-client';
import { ErrorState } from './feedback';

interface QueryErrorStateProps {
  title: string;
  /** The failed query: its error is explained, with the request id, and "Try again" refetches it. */
  query: Pick<UseQueryResult, 'error' | 'isFetching' | 'refetch'>;
}

/** The error state every screen shows when the data it needs failed to load. */
export function QueryErrorState({
  title,
  query: { error, isFetching, refetch },
}: QueryErrorStateProps) {
  return (
    <ErrorState
      title={title}
      message={getErrorMessage(error)}
      requestId={isApiError(error) ? error.requestId : undefined}
      onRetry={() => void refetch()}
      retrying={isFetching}
    />
  );
}
