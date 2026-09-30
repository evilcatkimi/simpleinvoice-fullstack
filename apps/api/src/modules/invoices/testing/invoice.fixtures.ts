import type { Invoice } from '../domain/invoice';
import { Money } from '../domain/money';
import type { InvoiceEntity } from '../infrastructure/invoice.entity';

/** The Appendix A invoice as a domain object. */
export function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
    invoiceNumber: 'IV1780488206995',
    invoiceReference: '#5721662',
    invoiceDate: '2026-06-03',
    dueDate: '2026-07-03',
    currency: 'AUD',
    currencySymbol: 'AU$',
    description: 'Invoice is issued to Kanglee',
    status: 'Pending',
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
        rate: new Money('1000'),
        amount: new Money('2000'),
      },
    ],
    taxRate: new Money('10'),
    invoiceSubTotal: new Money('2000'),
    totalTax: new Money('200'),
    totalDiscount: new Money('20'),
    totalAmount: new Money('2180'),
    totalPaid: new Money('1451.34'),
    balanceAmount: new Money('728.66'),
    createdBy: 'ad1e0902-1928-4345-b513-60c86c94fc91',
    createdAt: new Date('2026-06-03T12:03:26.995Z'),
    ...overrides,
  };
}

/** The Appendix A invoice exactly as TypeORM hydrates it from PostgreSQL (NUMERIC → string, DATE → 'YYYY-MM-DD'). */
export function buildInvoiceEntity(overrides: Partial<InvoiceEntity> = {}): InvoiceEntity {
  return {
    id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
    invoiceNumber: 'IV1780488206995',
    invoiceReference: '#5721662',
    invoiceDate: '2026-06-03',
    dueDate: '2026-07-03',
    currency: 'AUD',
    currencySymbol: 'AU$',
    description: 'Invoice is issued to Kanglee',
    status: 'Pending',
    customer: {
      fullname: 'Paul',
      email: 'paul@101digital.io',
      mobileNumber: '947717364111',
      address: 'Singapore',
    },
    taxRate: '10.00',
    invoiceSubTotal: '2000.00',
    totalTax: '200.00',
    totalDiscount: '20.00',
    totalAmount: '2180.00',
    totalPaid: '1451.34',
    balanceAmount: '728.66',
    createdBy: 'ad1e0902-1928-4345-b513-60c86c94fc91',
    createdAt: new Date('2026-06-03T12:03:26.995Z'),
    updatedAt: new Date('2026-06-03T12:03:26.995Z'),
    items: [
      {
        id: 'b1c2d3e4-0000-0000-0000-000000000001',
        invoiceId: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
        name: 'Honda RC150',
        quantity: 2,
        rate: '1000.00',
        amount: '2000.00',
        position: 0,
        createdAt: new Date('2026-06-03T12:03:26.995Z'),
      },
    ],
    ...overrides,
  };
}
