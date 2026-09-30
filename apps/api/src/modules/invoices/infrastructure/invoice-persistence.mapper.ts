import type { Invoice, InvoiceSummary, NewInvoice } from '../domain/invoice';
import { Money, toMoneyString } from '../domain/money';
import type { InvoiceItemEntity } from './invoice-item.entity';
import type { InvoiceEntity } from './invoice.entity';

/** Column values for an INSERT (relations and database-managed timestamps excluded). */
export type InvoiceRow = Omit<InvoiceEntity, 'items' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<InvoiceEntity, 'createdAt'>>;
export type InvoiceItemRow = Omit<InvoiceItemEntity, 'invoice' | 'createdAt'>;

/** NUMERIC text → exact decimal. */
const decimal = (value: string) => new Money(value);

export function toInvoice(entity: InvoiceEntity): Invoice {
  return {
    ...toInvoiceSummary(entity),
    description: entity.description,
    customer: { ...entity.customer },
    items: [...entity.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        rate: decimal(item.rate),
        amount: decimal(item.amount),
      })),
    taxRate: decimal(entity.taxRate),
    invoiceSubTotal: decimal(entity.invoiceSubTotal),
    totalTax: decimal(entity.totalTax),
    totalDiscount: decimal(entity.totalDiscount),
    createdBy: entity.createdBy,
  };
}

/** Works on the partial entities loaded by the list query (only the summary columns are selected). */
export function toInvoiceSummary(entity: InvoiceEntity): InvoiceSummary {
  return {
    id: entity.id,
    invoiceNumber: entity.invoiceNumber,
    invoiceReference: entity.invoiceReference,
    invoiceDate: entity.invoiceDate,
    dueDate: entity.dueDate,
    currency: entity.currency,
    currencySymbol: entity.currencySymbol,
    status: entity.status,
    customer: { fullname: entity.customer.fullname, email: entity.customer.email },
    totalAmount: decimal(entity.totalAmount),
    totalPaid: decimal(entity.totalPaid),
    balanceAmount: decimal(entity.balanceAmount),
    createdAt: entity.createdAt,
  };
}

/** Decimals are written as exact 2-dp strings, never as floats. */
export function toInvoiceRow(invoice: NewInvoice & { createdAt?: Date }): InvoiceRow {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceReference: invoice.invoiceReference,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    currencySymbol: invoice.currencySymbol,
    description: invoice.description,
    status: invoice.status,
    customer: { ...invoice.customer },
    taxRate: toMoneyString(invoice.taxRate),
    invoiceSubTotal: toMoneyString(invoice.invoiceSubTotal),
    totalTax: toMoneyString(invoice.totalTax),
    totalDiscount: toMoneyString(invoice.totalDiscount),
    totalAmount: toMoneyString(invoice.totalAmount),
    totalPaid: toMoneyString(invoice.totalPaid),
    balanceAmount: toMoneyString(invoice.balanceAmount),
    createdBy: invoice.createdBy,
    ...(invoice.createdAt && { createdAt: invoice.createdAt }),
  };
}

export function toInvoiceItemRows(invoice: NewInvoice): InvoiceItemRow[] {
  return invoice.items.map((item, position) => ({
    id: item.id,
    invoiceId: invoice.id,
    name: item.name,
    quantity: item.quantity,
    rate: toMoneyString(item.rate),
    amount: toMoneyString(item.amount),
    position,
  }));
}
