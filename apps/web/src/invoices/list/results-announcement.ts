import type { UseQueryResult } from '@tanstack/react-query';
import { pluralise } from '@/core/formatting/format';
import type { InvoiceListResponse } from '../model/invoice';

/**
 * Text of the list's status region, which screen readers announce whenever it changes: the count
 * (and the page, when there are several), or the heading of the empty state that replaced the rows.
 */
export function announceResults(
  { isPending, isPlaceholderData, isError, data }: UseQueryResult<InvoiceListResponse>,
  filtered: boolean,
): string {
  if (isPending || isPlaceholderData) return 'Loading invoices…';
  // The error state is an alert, which announces itself.
  if (isError) return '';

  const { data: invoices, paging } = data;
  if (invoices.length > 0) {
    const found = `${paging.total} ${pluralise(paging.total, 'invoice')} found`;
    return paging.totalPages > 1 ? `${found}, page ${paging.page} of ${paging.totalPages}` : found;
  }
  if (filtered) return 'No invoices match your filters';
  return paging.total > 0 ? 'This page is empty' : 'No invoices yet';
}
