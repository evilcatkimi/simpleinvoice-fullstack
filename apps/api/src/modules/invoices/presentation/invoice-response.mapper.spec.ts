import { toPage } from '../../../shared/pagination/page';
import { withEffectiveStatus } from '../domain/invoice-status';
import { Money } from '../domain/money';
import { buildInvoice } from '../testing/invoice.fixtures';
import {
  toInvoiceDetailDto,
  toInvoicePageDto,
  toInvoiceSummaryDto,
} from './invoice-response.mapper';

describe('invoice response mapper', () => {
  const overdueView = withEffectiveStatus(buildInvoice(), '2026-09-29');

  it('renders the Appendix A invoice exactly as the contract detail example', () => {
    expect(toInvoiceDetailDto(overdueView)).toEqual({
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
      createdBy: 'ad1e0902-1928-4345-b513-60c86c94fc91',
    });
  });

  it('exposes only the list fields (customer name and e-mail) in a summary', () => {
    const summary = toInvoiceSummaryDto(overdueView);

    expect(summary.customer).toEqual({ fullname: 'Paul', email: 'paul@101digital.io' });
    expect(summary).not.toHaveProperty('items');
    expect(summary).not.toHaveProperty('description');
  });

  it('keeps optional fields as null', () => {
    const invoice = buildInvoice({ invoiceReference: null, description: null });
    const detail = toInvoiceDetailDto(
      withEffectiveStatus(
        { ...invoice, customer: { ...invoice.customer, mobileNumber: null, address: null } },
        '2026-06-10',
      ),
    );

    expect(detail).toMatchObject({
      invoiceReference: null,
      description: null,
      status: 'Pending',
      customer: { mobileNumber: null, address: null },
    });
  });

  it('serialises the largest storable amount and odd cents exactly as JSON numbers', () => {
    const invoice = buildInvoice({
      totalAmount: new Money('999999999999.99'),
      totalPaid: new Money('0.10').plus('0.20'),
      balanceAmount: new Money('999999999999.69'),
    });

    const json = JSON.stringify(toInvoiceSummaryDto(withEffectiveStatus(invoice, '2026-06-10')));

    expect(json).toContain('"totalAmount":999999999999.99');
    expect(json).toContain('"totalPaid":0.3,');
    expect(json).toContain('"balanceAmount":999999999999.69');
  });

  it('wraps a page as { data, paging }', () => {
    const page = toPage([overdueView], 41, { page: 1, pageSize: 10 });

    expect(toInvoicePageDto(page)).toEqual({
      data: [toInvoiceSummaryDto(overdueView)],
      paging: { page: 1, pageSize: 10, total: 41, totalPages: 5 },
    });
  });
});
