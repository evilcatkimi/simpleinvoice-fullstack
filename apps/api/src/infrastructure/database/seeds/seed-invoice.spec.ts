import {
  toInvoiceItemRows,
  toInvoiceRow,
} from '../../../modules/invoices/infrastructure/invoice-persistence.mapper';
import { APPENDIX_A_INVOICE } from './appendix-a';
import { ADMIN_USER_ID } from './seed';
import { toSeededInvoice, type SeedInvoice } from './seed-invoice';

describe('toSeededInvoice', () => {
  it('reproduces every Appendix A figure with the invoice calculator', () => {
    const invoice = toSeededInvoice(APPENDIX_A_INVOICE, ADMIN_USER_ID);

    expect(toInvoiceRow(invoice)).toMatchObject({
      id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
      invoiceNumber: 'IV1780488206995',
      currency: 'AUD',
      currencySymbol: 'AU$',
      status: 'Pending',
      taxRate: '10.00',
      invoiceSubTotal: '2000.00',
      totalTax: '200.00',
      totalDiscount: '20.00',
      totalAmount: '2180.00',
      totalPaid: '1451.34',
      balanceAmount: '728.66',
      createdBy: ADMIN_USER_ID,
      createdAt: new Date('2026-06-03T12:03:26.995Z'),
    });
    expect(toInvoiceItemRows(invoice)).toEqual([
      {
        id: 'b1c2d3e4-0000-0000-0000-000000000001',
        invoiceId: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
        name: 'Honda RC150',
        quantity: 2,
        rate: '1000.00',
        amount: '2000.00',
        position: 0,
      },
    ]);
  });

  it('refuses seed data in a currency the API does not support (no symbol to derive)', () => {
    const invalid = { ...APPENDIX_A_INVOICE, currency: 'XYZ' } as unknown as SeedInvoice;

    expect(() => toSeededInvoice(invalid, ADMIN_USER_ID)).toThrow(
      'Unsupported currency XYZ in seed data',
    );
  });
});
