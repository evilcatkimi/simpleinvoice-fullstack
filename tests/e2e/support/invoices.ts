import { randomBytes } from 'node:crypto';
import { type APIRequestContext, expect, type Page, type Response } from '@playwright/test';
import { isApiCall } from './http';

/** Shapes of docs/API_CONTRACT.md §4 (only what the tests read). */
export type InvoiceStatus = 'Draft' | 'Pending' | 'Paid' | 'Overdue';

export interface InvoiceSummary {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  customer: { fullname: string; email: string };
  totalAmount: number;
  totalPaid: number;
  balanceAmount: number;
  status: InvoiceStatus;
}

export interface InvoicePage {
  data: InvoiceSummary[];
  paging: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface InvoiceDetail extends InvoiceSummary {
  currencySymbol: string;
  items: { id: string; name: string; quantity: number; rate: number; amount: number }[];
  taxRate: number;
  invoiceSubTotal: number;
  totalTax: number;
  totalDiscount: number;
  createdBy: string;
}

/** How the SPA shows an AUD amount: the API's `currencySymbol`, then the amount ("AU$2,180.00"). */
export function aud(amount: string): string {
  return `AU$${amount}`;
}

/**
 * The Appendix A invoice, seeded verbatim, as the SPA displays it (en-GB dates). Its due date has
 * passed and it is only partly paid, so its status is derived as Overdue.
 */
export const APPENDIX_A = {
  invoiceNumber: 'IV1780488206995',
  invoiceDate: '2026-06-03',
  invoiceDateText: '3 Jun 2026',
  status: 'Overdue',
  customerName: 'Paul',
  totalText: aud('2,180.00'),
  details: {
    'Invoice number': 'IV1780488206995',
    Reference: '#5721662',
    'Invoice date': '3 Jun 2026',
    'Due date': '3 Jul 2026',
    Currency: 'AUD (AU$)',
    Description: 'Invoice is issued to Kanglee',
  },
  customer: {
    Name: 'Paul',
    Email: 'paul@101digital.io',
    Mobile: '947717364111',
    Address: 'Singapore',
  },
  item: { name: 'Honda RC150', quantity: '2', rate: aud('1,000.00'), amount: aud('2,000.00') },
  summary: {
    Subtotal: aud('2,000.00'),
    'Tax (10%)': aud('200.00'),
    Discount: aud('20.00'),
    Total: aud('2,180.00'),
    'Amount paid': aud('1,451.34'),
    'Outstanding balance': aud('728.66'),
  },
} as const;

/** What a user types into the create form. Blank optional fields are simply not filled. */
export interface NewInvoice {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  itemName: string;
  quantity: string;
  rate: string;
  taxRate: string;
  discount: string;
}

/**
 * Unique across tests, workers and runs. Digits and upper-case hex only: no search keyword used by
 * another test (such as "pAu") can ever match one of these.
 */
function uniqueInvoiceNumber(): string {
  return `E2E-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** 3 × 33.33 at 10% tax with a 5.00 discount: the server must answer 99.99 / 10.00 / 104.99. */
export function newInvoice(overrides: Partial<NewInvoice> = {}): NewInvoice {
  return {
    invoiceNumber: uniqueInvoiceNumber(),
    customerName: 'E2E Buyer',
    customerEmail: 'e2e.buyer@example.com',
    itemName: 'E2E consulting',
    quantity: '3',
    rate: '33.33',
    taxRate: '10',
    discount: '5',
    ...overrides,
  };
}

/** The SPA sends this on every call; the API requires it on cookie-authenticated POSTs (CSRF). */
export const CSRF_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

/** Calendar date `days` from today in the local time zone, as the SPA computes its defaults. */
export function isoDate(days = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Arranges test data through the same proxied API the SPA uses, with the session cookie of the
 * request context (e.g. `page.request`). Faster and less brittle than clicking through the form
 * when the form itself is not what the test is about.
 */
export async function createInvoiceViaApi(
  request: APIRequestContext,
  invoice: NewInvoice,
): Promise<InvoiceDetail> {
  const response = await request.post('/api/invoices', {
    headers: CSRF_HEADERS,
    data: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: isoDate(),
      dueDate: isoDate(30),
      currency: 'AUD',
      customer: { fullname: invoice.customerName, email: invoice.customerEmail },
      items: [
        { name: invoice.itemName, quantity: Number(invoice.quantity), rate: Number(invoice.rate) },
      ],
      taxRate: Number(invoice.taxRate),
      discount: Number(invoice.discount),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as InvoiceDetail;
}

/**
 * Resolves with the next `GET /api/invoices` whose query string holds every given value (`null`
 * means the parameter must be absent). Register it before the action that triggers the request.
 * The SPA always sends page, pageSize, sortBy and ordering, plus the filters that are set.
 */
export function waitForInvoiceList(
  page: Page,
  query: Record<string, string | null>,
): Promise<Response> {
  const isInvoiceList = isApiCall('GET', '/api/invoices');
  return page.waitForResponse((response) => {
    const { searchParams } = new URL(response.url());
    return (
      isInvoiceList(response) &&
      Object.entries(query).every(([key, value]) => searchParams.get(key) === value)
    );
  });
}

/** Reads a list response after checking it succeeded. */
export async function readInvoicePage(response: Response): Promise<InvoicePage> {
  expect(response.status(), `GET ${response.url()}`).toBe(200);
  return (await response.json()) as InvoicePage;
}

/** "AU$2,180.00", "S$1,234.50", "₫12.00"… → 2180, 1234.5, 12 (all amounts are positive). */
export function parseMoney(text: string): number {
  const digits = text.replace(/[^\d.]/g, '');
  const value = Number(digits);
  if (!/\d/.test(digits) || Number.isNaN(value)) throw new Error(`Not an amount: "${text}"`);
  return value;
}

export function isNonDecreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! <= value);
}
