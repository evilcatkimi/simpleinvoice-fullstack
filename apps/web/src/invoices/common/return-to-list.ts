import { readLocationState } from '@/core/routing/location-state';

/**
 * Links from the list to other invoice screens carry the list's query string in router state, so
 * "Back to invoices" returns to the same page, filters and sort order.
 */
export interface ReturnToListState {
  listSearch: string;
}

export function returnToListState(search: string): ReturnToListState {
  return { listSearch: search };
}

/** The list URL to go back to; falls back to the unfiltered list for direct visits. */
export function getReturnToListPath(locationState: unknown): string {
  const listSearch = readLocationState(
    locationState,
    'listSearch' satisfies keyof ReturnToListState,
  );
  // Only a query string is accepted, so the state can never redirect outside the list screen.
  return typeof listSearch === 'string' && listSearch.startsWith('?')
    ? `/invoices${listSearch}`
    : '/invoices';
}
