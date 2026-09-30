import type Decimal from 'decimal.js';
import { BusinessRuleViolationError } from '../../../shared/errors/application-errors';
import { MAX_MONEY_AMOUNT, Money, roundMoney } from './money';

/** What a new invoice gets when it leaves them out: 10 % tax, no discount. */
export const DEFAULT_TAX_RATE = 10;
export const DEFAULT_DISCOUNT = 0;

export interface InvoiceLineInput {
  quantity: number;
  rate: Decimal.Value;
}

export interface InvoiceCalculationInput {
  items: readonly InvoiceLineInput[];
  /** Percentage, e.g. 10 for 10 %. */
  taxRate: Decimal.Value;
  /** Absolute amount in the invoice currency. */
  discount: Decimal.Value;
  totalPaid?: Decimal.Value;
}

export interface InvoiceTotals {
  lineAmounts: Decimal[];
  subTotal: Decimal;
  taxAmount: Decimal;
  discount: Decimal;
  totalAmount: Decimal;
  totalPaid: Decimal;
  balanceAmount: Decimal;
}

/** The requested amounts break an invoicing rule (reported to clients as 400). */
export class InvoiceCalculationError extends BusinessRuleViolationError {}

export const DISCOUNT_EXCEEDS_TOTAL = 'discount must not exceed subtotal plus tax';
export const TOTAL_EXCEEDS_MAXIMUM = `invoice total must not exceed ${MAX_MONEY_AMOUNT.toFixed(2)}`;
export const PAYMENT_EXCEEDS_TOTAL = 'totalPaid must not exceed the invoice total';

/**
 * Pure, server-side invoice maths (ROUND_HALF_UP to 2 decimals):
 *   subTotal      = Σ quantity × rate
 *   taxAmount     = round2(subTotal × taxRate / 100)
 *   totalAmount   = subTotal + taxAmount − discount
 *   balanceAmount = totalAmount − totalPaid
 * Tax is rounded once on the subtotal (not per line) so the invoice matches what a customer recomputes by hand.
 */
export function calculateInvoiceTotals(input: InvoiceCalculationInput): InvoiceTotals {
  const lineAmounts = input.items.map((item) =>
    roundMoney(new Money(item.rate).times(item.quantity)),
  );
  const subTotal = lineAmounts.reduce((sum, amount) => sum.plus(amount), new Money(0));
  const taxAmount = roundMoney(subTotal.times(input.taxRate).dividedBy(100));
  const grossTotal = subTotal.plus(taxAmount);
  if (grossTotal.greaterThan(MAX_MONEY_AMOUNT)) {
    throw new InvoiceCalculationError(TOTAL_EXCEEDS_MAXIMUM);
  }

  const discount = roundMoney(input.discount);
  if (discount.greaterThan(grossTotal)) {
    throw new InvoiceCalculationError(DISCOUNT_EXCEEDS_TOTAL);
  }
  const totalAmount = grossTotal.minus(discount);

  const totalPaid = roundMoney(input.totalPaid ?? 0);
  if (totalPaid.greaterThan(totalAmount)) {
    throw new InvoiceCalculationError(PAYMENT_EXCEEDS_TOTAL);
  }

  return {
    lineAmounts,
    subTotal,
    taxAmount,
    discount,
    totalAmount,
    totalPaid,
    balanceAmount: totalAmount.minus(totalPaid),
  };
}
