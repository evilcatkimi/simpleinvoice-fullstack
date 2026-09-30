import type { Page } from '../../../shared/pagination/page';
import type { InvoiceSummaryView, InvoiceView } from '../domain/invoice';
import { toMoneyNumber } from '../domain/money';
import type {
  InvoiceDetailDto,
  InvoicePageDto,
  InvoiceSummaryDto,
} from './dto/invoice-response.dto';

/** API edge: exact decimals become JSON numbers rounded to 2 dp; timestamps become ISO-8601 UTC strings. */
export function toInvoiceSummaryDto(invoice: InvoiceSummaryView): InvoiceSummaryDto {
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceReference: invoice.invoiceReference,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    currencySymbol: invoice.currencySymbol,
    customer: { fullname: invoice.customer.fullname, email: invoice.customer.email },
    totalAmount: toMoneyNumber(invoice.totalAmount),
    totalPaid: toMoneyNumber(invoice.totalPaid),
    balanceAmount: toMoneyNumber(invoice.balanceAmount),
    status: invoice.status,
    createdAt: invoice.createdAt.toISOString(),
  };
}

export function toInvoiceDetailDto(invoice: InvoiceView): InvoiceDetailDto {
  const { customer: _summaryCustomer, ...summary } = toInvoiceSummaryDto(invoice);
  return {
    ...summary,
    description: invoice.description,
    customer: { ...invoice.customer },
    items: invoice.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      rate: toMoneyNumber(item.rate),
      amount: toMoneyNumber(item.amount),
    })),
    taxRate: toMoneyNumber(invoice.taxRate),
    invoiceSubTotal: toMoneyNumber(invoice.invoiceSubTotal),
    totalTax: toMoneyNumber(invoice.totalTax),
    totalDiscount: toMoneyNumber(invoice.totalDiscount),
    createdBy: invoice.createdBy,
  };
}

export function toInvoicePageDto(page: Page<InvoiceSummaryView>): InvoicePageDto {
  return {
    data: page.items.map(toInvoiceSummaryDto),
    paging: {
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages,
    },
  };
}
