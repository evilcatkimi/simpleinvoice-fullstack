import { randomUUID } from 'node:crypto';
import type { SeedInvoice } from '../../src/infrastructure/database/seeds/seed-invoice';

/** An invoice stored directly (bypassing the API) so tests can control status, dates and payments. */
export function seedInvoice(
  overrides: Partial<SeedInvoice> & Pick<SeedInvoice, 'invoiceNumber'>,
): SeedInvoice {
  return {
    id: randomUUID(),
    invoiceReference: null,
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-31',
    currency: 'AUD',
    description: null,
    status: 'Draft',
    customer: {
      fullname: 'Test Customer',
      email: 'customer@example.com',
      mobileNumber: null,
      address: null,
    },
    item: { id: randomUUID(), name: 'Service', quantity: 1, rate: '100.00' },
    taxRate: '0',
    discount: '0',
    totalPaid: '0',
    createdAt: new Date('2026-07-01T09:00:00.000Z'),
    ...overrides,
  };
}

/** A valid POST /invoices body. */
export function createInvoiceBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    invoiceNumber: `E2E-${randomUUID().slice(0, 8)}`,
    invoiceReference: 'PO-778',
    invoiceDate: '2026-07-15',
    dueDate: '2026-08-14',
    currency: 'AUD',
    description: 'Consulting services',
    customer: {
      fullname: 'Jane Doe',
      email: 'jane@example.com',
      mobileNumber: '+61 400 000 000',
      address: 'Sydney',
    },
    items: [{ name: 'Consulting', quantity: 2, rate: 150.5 }],
    taxRate: 10,
    discount: 0,
    ...overrides,
  };
}
