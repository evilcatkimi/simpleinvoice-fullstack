/** Mirrors docs/API_CONTRACT.md §4–5. Money is a number rounded to 2 dp by the server. */

export const INVOICE_STATUSES = ['Draft', 'Pending', 'Paid', 'Overdue'] as const;
/** `Overdue` is never stored; the API derives it (not paid and past its due date). */
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const SORT_FIELDS = ['invoiceDate', 'dueDate', 'totalAmount'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_ORDERS = ['ASC', 'DESC'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface InvoiceSummary {
  invoiceId: string;
  invoiceNumber: string;
  invoiceReference: string | null;
  /** Calendar date, "YYYY-MM-DD". */
  invoiceDate: string;
  /** Calendar date, "YYYY-MM-DD". */
  dueDate: string;
  /** ISO-4217 code, e.g. "AUD". */
  currency: string;
  currencySymbol: string;
  customer: { fullname: string; email: string };
  totalAmount: number;
  totalPaid: number;
  balanceAmount: number;
  status: InvoiceStatus;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
}

export interface Paging {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface InvoiceListResponse {
  data: InvoiceSummary[];
  paging: Paging;
}

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoiceDetail extends Omit<InvoiceSummary, 'customer'> {
  description: string | null;
  customer: {
    fullname: string;
    email: string;
    mobileNumber: string | null;
    address: string | null;
  };
  items: InvoiceItem[];
  /** Percentage, e.g. 10 for 10%. */
  taxRate: number;
  invoiceSubTotal: number;
  totalTax: number;
  totalDiscount: number;
  createdBy: string;
}

/**
 * Body of POST /invoices. Totals, status and currencySymbol are deliberately absent: the API
 * computes them and rejects them if sent.
 */
export interface CreateInvoiceRequest {
  invoiceNumber: string;
  invoiceReference?: string | undefined;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  description?: string | undefined;
  customer: {
    fullname: string;
    email: string;
    mobileNumber?: string | undefined;
    address?: string | undefined;
  };
  /** Exactly one line item for now (the data model supports more). */
  items: [{ name: string; quantity: number; rate: number }];
  taxRate: number;
  discount?: number | undefined;
}

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}
