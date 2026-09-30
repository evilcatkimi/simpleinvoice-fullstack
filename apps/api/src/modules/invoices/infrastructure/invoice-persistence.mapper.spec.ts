import { buildInvoice, buildInvoiceEntity } from '../testing/invoice.fixtures';
import {
  toInvoice,
  toInvoiceItemRows,
  toInvoiceRow,
  toInvoiceSummary,
} from './invoice-persistence.mapper';

describe('invoice persistence mapper', () => {
  it('turns NUMERIC text into exact decimals', () => {
    const invoice = toInvoice(buildInvoiceEntity({ totalPaid: '0.10', balanceAmount: '2179.90' }));

    expect(invoice.totalPaid.plus('0.20').toFixed(2)).toBe('0.30'); // 0.1 + 0.2 !== 0.3 with floats
    expect(invoice.balanceAmount.toFixed(2)).toBe('2179.90');
    expect(invoice.taxRate.toNumber()).toBe(10);
  });

  it('orders items by their stored position', () => {
    const entity = buildInvoiceEntity();
    const [line] = entity.items;
    const invoice = toInvoice({
      ...entity,
      items: [
        { ...line, id: 'second', position: 1 },
        { ...line, id: 'first', position: 0 },
      ],
    });

    expect(invoice.items.map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('maps only the list columns into a summary', () => {
    expect(Object.keys(toInvoiceSummary(buildInvoiceEntity())).sort()).toEqual(
      [
        'balanceAmount',
        'createdAt',
        'currency',
        'currencySymbol',
        'customer',
        'dueDate',
        'id',
        'invoiceDate',
        'invoiceNumber',
        'invoiceReference',
        'status',
        'totalAmount',
        'totalPaid',
      ].sort(),
    );
  });

  it('writes decimals as 2-dp strings and lets the database stamp createdAt', () => {
    const { createdAt: _createdAt, ...newInvoice } = buildInvoice();
    const row = toInvoiceRow(newInvoice);

    expect(row).toMatchObject({
      taxRate: '10.00',
      invoiceSubTotal: '2000.00',
      totalAmount: '2180.00',
      balanceAmount: '728.66',
    });
    expect(row).not.toHaveProperty('createdAt');
    expect(toInvoiceItemRows(newInvoice)).toEqual([
      expect.objectContaining({ rate: '1000.00', amount: '2000.00', position: 0 }),
    ]);
  });

  it('round-trips an invoice through its row representation', () => {
    const entity = buildInvoiceEntity();

    expect(toInvoiceRow(toInvoice(entity))).toMatchObject({
      invoiceSubTotal: entity.invoiceSubTotal,
      totalTax: entity.totalTax,
      totalDiscount: entity.totalDiscount,
      totalAmount: entity.totalAmount,
      totalPaid: entity.totalPaid,
      balanceAmount: entity.balanceAmount,
    });
  });
});
