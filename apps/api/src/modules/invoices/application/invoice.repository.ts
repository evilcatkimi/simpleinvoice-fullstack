import type { PageRequest } from '../../../shared/pagination/page';
import type { Invoice, InvoiceSummary, NewInvoice } from '../domain/invoice';
import type { InvoiceStatus } from '../domain/invoice-status';

export const INVOICE_SORT_FIELDS = ['invoiceDate', 'dueDate', 'totalAmount'] as const;
export type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

export const SORT_ORDERS = ['ASC', 'DESC'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface InvoiceFilters {
  /** Effective status: Overdue is matched through the due date, not a stored value. */
  status?: InvoiceStatus;
  /** Case-insensitive partial match on invoice number or customer name. */
  keyword?: string;
  /** Inclusive invoice-date range (YYYY-MM-DD). */
  fromDate?: string;
  toDate?: string;
}

export interface InvoiceSearchCriteria extends InvoiceFilters, PageRequest {
  sortBy: InvoiceSortField;
  ordering: SortOrder;
  /** Reference date for the derived Overdue status. */
  today: string;
}

export interface InvoiceSearchResult {
  items: InvoiceSummary[];
  /** Number of invoices matching the filters (all pages). */
  total: number;
}

/**
 * Port through which the application reads and writes invoices; the TypeORM adapter lives in the infrastructure
 * layer. An abstract class (not an interface) so it can serve as the Nest injection token.
 */
export abstract class InvoiceRepository {
  abstract search(criteria: InvoiceSearchCriteria): Promise<InvoiceSearchResult>;

  abstract findById(id: string): Promise<Invoice | null>;

  /**
   * Stores the invoice and its items atomically and returns it as stored.
   * @throws DuplicateInvoiceNumberError when the invoice number is already taken.
   */
  abstract create(invoice: NewInvoice): Promise<Invoice>;
}
