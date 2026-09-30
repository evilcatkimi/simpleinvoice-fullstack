import type Decimal from 'decimal.js';
import type { PersistedInvoiceStatus, WithEffectiveStatus } from './invoice-status';

export interface InvoiceCustomer {
  fullname: string;
  email: string;
  mobileNumber: string | null;
  address: string | null;
}

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  rate: Decimal;
  /** quantity × rate */
  amount: Decimal;
}

/**
 * An invoice as stored. Money is exact (decimal.js), dates are `YYYY-MM-DD` calendar dates, and `status` is the
 * persisted one: Overdue is derived when the invoice is read (see `withEffectiveStatus`).
 */
export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceReference: string | null;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  currencySymbol: string;
  description: string | null;
  status: PersistedInvoiceStatus;
  /** Snapshot of the customer at issue time. */
  customer: InvoiceCustomer;
  items: InvoiceItem[];
  /** Percentage, e.g. 10 for 10 %. */
  taxRate: Decimal;
  invoiceSubTotal: Decimal;
  totalTax: Decimal;
  totalDiscount: Decimal;
  totalAmount: Decimal;
  totalPaid: Decimal;
  balanceAmount: Decimal;
  createdBy: string;
  createdAt: Date;
}

/** What the invoice list shows. */
export type InvoiceSummary = Pick<
  Invoice,
  | 'id'
  | 'invoiceNumber'
  | 'invoiceReference'
  | 'invoiceDate'
  | 'dueDate'
  | 'currency'
  | 'currencySymbol'
  | 'status'
  | 'totalAmount'
  | 'totalPaid'
  | 'balanceAmount'
  | 'createdAt'
> & { customer: Pick<InvoiceCustomer, 'fullname' | 'email'> };

/** An invoice about to be stored: the database assigns the creation timestamp. */
export type NewInvoice = Omit<Invoice, 'createdAt'>;

export type InvoiceView = WithEffectiveStatus<Invoice>;
export type InvoiceSummaryView = WithEffectiveStatus<InvoiceSummary>;
