import { addDays } from '@/core/calendar/calendar-date';
import type { Currency, InvoiceDetail, InvoiceStatus } from '@/invoices/model/invoice';
import type { AuthUser } from '@/session/session-api';

export const DEMO_USER: AuthUser = {
  id: 'ad1e0902-1928-4345-b513-60c86c94fc91',
  email: 'reviewer@simpleinvoice.dev',
  fullname: 'Demo Reviewer',
};
// Deliberately not the documented demo password: the fake API only ever accepts this test value.
export const TEST_PASSWORD = 'Test-Only-Password-1';

/** Appendix A of the specification, exactly as GET /invoices/:id returns it. */
export const APPENDIX_A_INVOICE: InvoiceDetail = {
  invoiceId: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
  invoiceNumber: 'IV1780488206995',
  invoiceReference: '#5721662',
  invoiceDate: '2026-06-03',
  dueDate: '2026-07-03',
  currency: 'AUD',
  currencySymbol: 'AU$',
  description: 'Invoice is issued to Kanglee',
  status: 'Overdue',
  customer: {
    fullname: 'Paul',
    email: 'paul@101digital.io',
    mobileNumber: '947717364111',
    address: 'Singapore',
  },
  items: [
    {
      id: 'b1c2d3e4-0000-0000-0000-000000000001',
      name: 'Honda RC150',
      quantity: 2,
      rate: 1000,
      amount: 2000,
    },
  ],
  taxRate: 10,
  invoiceSubTotal: 2000,
  totalTax: 200,
  totalDiscount: 20,
  totalAmount: 2180,
  totalPaid: 1451.34,
  balanceAmount: 728.66,
  createdAt: '2026-06-03T12:03:26.995Z',
  createdBy: DEMO_USER.id,
};

const CUSTOMERS = ['Alice Nguyen', 'Bob Tran', 'Carol Smith', 'David Lee', 'Emma Wilson'];
const STATUSES: InvoiceStatus[] = ['Draft', 'Pending', 'Paid', 'Overdue'];

/**
 * Predictable invoices INV-0001…INV-00NN: one per day from 2026-01-01, subtotal N × 100 AUD,
 * no optional fields. Together with Appendix A the default data set spans three pages of 10.
 */
export function buildInvoices(count: number): InvoiceDetail[] {
  return Array.from({ length: count }, (_, index): InvoiceDetail => {
    const sequence = index + 1;
    const invoiceDate = addDays('2026-01-01', index);
    const subTotal = sequence * 100;
    return {
      invoiceId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
      invoiceNumber: `INV-${String(sequence).padStart(4, '0')}`,
      invoiceReference: null,
      invoiceDate,
      dueDate: addDays(invoiceDate, 30),
      currency: 'AUD',
      currencySymbol: 'AU$',
      description: null,
      status: STATUSES[index % STATUSES.length] ?? 'Draft',
      customer: {
        fullname: CUSTOMERS[index % CUSTOMERS.length] ?? 'Customer',
        email: `customer${sequence}@example.com`,
        mobileNumber: null,
        address: null,
      },
      items: [
        {
          id: `item-${sequence}`,
          name: 'Consulting',
          quantity: sequence,
          rate: 100,
          amount: subTotal,
        },
      ],
      taxRate: 10,
      invoiceSubTotal: subTotal,
      totalTax: subTotal / 10,
      totalDiscount: 0,
      totalAmount: subTotal * 1.1,
      totalPaid: 0,
      balanceAmount: subTotal * 1.1,
      createdAt: `${invoiceDate}T09:00:00.000Z`,
      createdBy: DEMO_USER.id,
    };
  });
}

export const CURRENCIES: Currency[] = [
  { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar' },
  { code: 'USD', symbol: 'US$', name: 'US Dollar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
];
