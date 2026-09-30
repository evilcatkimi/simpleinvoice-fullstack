import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Currency } from '../model/invoice';
import type { InvoiceListQuery } from '../model/list-query';
import { createInvoice, fetchCurrencies, fetchInvoice, fetchInvoices } from './invoice-api';

/** Hierarchical keys: invalidating `lists()` refreshes every filtered/paged variant at once. */
const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (params: InvoiceListQuery) => [...invoiceKeys.lists(), params] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (invoiceId: string) => [...invoiceKeys.details(), invoiceId] as const,
};

const currencyKeys = {
  all: ['currencies'] as const,
};

/**
 * Resilience fallback for the currency select, mirroring the contract's supported list (§5).
 * GET /currencies replaces it as soon as it answers. It only shows while that request is in flight
 * (so the default AUD is selectable on the first render) or if it fails (so the form still works).
 * The API stays the authority: it rejects an unsupported code with a 400.
 */
export const FALLBACK_CURRENCIES: Currency[] = [
  { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar' },
  { code: 'USD', symbol: 'US$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
];

export function useInvoices(params: InvoiceListQuery) {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: ({ signal }) => fetchInvoices(params, signal),
    // Keep showing the current page while the next one loads instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  });
}

function invoiceDetailQueryOptions(invoiceId: string) {
  return queryOptions({
    queryKey: invoiceKeys.detail(invoiceId),
    queryFn: ({ signal }) => fetchInvoice(invoiceId, signal),
  });
}

export function useInvoice(invoiceId: string) {
  return useQuery(invoiceDetailQueryOptions(invoiceId));
}

export function useCurrencies() {
  return useQuery({
    queryKey: currencyKeys.all,
    queryFn: ({ signal }) => fetchCurrencies(signal),
    staleTime: Infinity,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInvoice,
    // The variables are the customer's details: keep them only while the create screen is open.
    gcTime: 0,
    onSuccess: (invoice) => {
      // The 201 body is the full invoice: opening it next needs no extra request.
      queryClient.setQueryData(invoiceDetailQueryOptions(invoice.invoiceId).queryKey, invoice);
      // Reset, not invalidate: cached pages would otherwise show up first, without the new invoice,
      // until the refetch lands.
      return queryClient.resetQueries({ queryKey: invoiceKeys.lists() });
    },
  });
}
