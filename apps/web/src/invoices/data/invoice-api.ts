import { apiRequest } from '@/core/api/api-client';
import type {
  CreateInvoiceRequest,
  Currency,
  InvoiceDetail,
  InvoiceListResponse,
} from '../model/invoice';
import type { InvoiceListQuery } from '../model/list-query';

export function fetchInvoices(
  params: InvoiceListQuery,
  signal?: AbortSignal,
): Promise<InvoiceListResponse> {
  return apiRequest<InvoiceListResponse>('/invoices', { query: params, signal });
}

export function fetchInvoice(invoiceId: string, signal?: AbortSignal): Promise<InvoiceDetail> {
  return apiRequest<InvoiceDetail>(`/invoices/${encodeURIComponent(invoiceId)}`, { signal });
}

export function createInvoice(payload: CreateInvoiceRequest): Promise<InvoiceDetail> {
  return apiRequest<InvoiceDetail>('/invoices', { method: 'POST', body: payload });
}

export function fetchCurrencies(signal?: AbortSignal): Promise<Currency[]> {
  return apiRequest<Currency[]>('/currencies', { signal });
}
