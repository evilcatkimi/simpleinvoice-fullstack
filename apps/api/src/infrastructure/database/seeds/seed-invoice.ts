import { findCurrency, type CurrencyCode } from '../../../modules/currencies/domain/currencies';
import type { NewInvoice } from '../../../modules/invoices/domain/invoice';
import { calculateInvoiceTotals } from '../../../modules/invoices/domain/invoice-calculator';
import type { PersistedInvoiceStatus } from '../../../modules/invoices/domain/invoice-status';
import { Money } from '../../../modules/invoices/domain/money';

/** Seed input: what a user would have entered (plus payment state); totals are always computed, never typed in. */
export interface SeedInvoice {
  id: string;
  invoiceNumber: string;
  invoiceReference: string | null;
  invoiceDate: string;
  dueDate: string;
  currency: CurrencyCode;
  description: string | null;
  status: PersistedInvoiceStatus;
  customer: {
    fullname: string;
    email: string;
    mobileNumber: string | null;
    address: string | null;
  };
  item: { id: string; name: string; quantity: number; rate: string };
  taxRate: string;
  discount: string;
  totalPaid: string;
  createdAt: Date;
}

/** Turns seed input into a domain invoice, running the amounts through the same calculator as the API. */
export function toSeededInvoice(
  seed: SeedInvoice,
  createdBy: string,
): NewInvoice & { createdAt: Date } {
  const currency = findCurrency(seed.currency);
  if (!currency) {
    throw new Error(`Unsupported currency ${seed.currency} in seed data`);
  }
  const totals = calculateInvoiceTotals({
    items: [seed.item],
    taxRate: seed.taxRate,
    discount: seed.discount,
    totalPaid: seed.totalPaid,
  });

  return {
    id: seed.id,
    invoiceNumber: seed.invoiceNumber,
    invoiceReference: seed.invoiceReference,
    invoiceDate: seed.invoiceDate,
    dueDate: seed.dueDate,
    currency: currency.code,
    currencySymbol: currency.symbol,
    description: seed.description,
    status: seed.status,
    customer: { ...seed.customer },
    items: [
      {
        id: seed.item.id,
        name: seed.item.name,
        quantity: seed.item.quantity,
        rate: new Money(seed.item.rate),
        amount: totals.lineAmounts[0],
      },
    ],
    taxRate: new Money(seed.taxRate),
    invoiceSubTotal: totals.subTotal,
    totalTax: totals.taxAmount,
    totalDiscount: totals.discount,
    totalAmount: totals.totalAmount,
    totalPaid: totals.totalPaid,
    balanceAmount: totals.balanceAmount,
    createdBy,
    createdAt: seed.createdAt,
  };
}
