import { BusinessRuleViolationError } from '../../../shared/errors/application-errors';
import {
  calculateInvoiceTotals,
  DISCOUNT_EXCEEDS_TOTAL,
  InvoiceCalculationError,
  PAYMENT_EXCEEDS_TOTAL,
  TOTAL_EXCEEDS_MAXIMUM,
  type InvoiceCalculationInput,
  type InvoiceTotals,
} from './invoice-calculator';

/** Compare as exact 2-dp strings: asserting on floats would hide the very errors these tests look for. */
function asStrings(totals: InvoiceTotals) {
  return {
    lineAmounts: totals.lineAmounts.map((amount) => amount.toFixed(2)),
    subTotal: totals.subTotal.toFixed(2),
    taxAmount: totals.taxAmount.toFixed(2),
    discount: totals.discount.toFixed(2),
    totalAmount: totals.totalAmount.toFixed(2),
    totalPaid: totals.totalPaid.toFixed(2),
    balanceAmount: totals.balanceAmount.toFixed(2),
  };
}

function calculate(overrides: Partial<InvoiceCalculationInput> = {}) {
  return asStrings(
    calculateInvoiceTotals({
      items: [{ quantity: 2, rate: 1000 }],
      taxRate: 10,
      discount: 20,
      ...overrides,
    }),
  );
}

describe('calculateInvoiceTotals', () => {
  it('reproduces the spec example: 2 × 1000, 10 % tax, 20 discount → 2180', () => {
    expect(calculate()).toEqual({
      lineAmounts: ['2000.00'],
      subTotal: '2000.00',
      taxAmount: '200.00',
      discount: '20.00',
      totalAmount: '2180.00',
      totalPaid: '0.00',
      balanceAmount: '2180.00',
    });
  });

  it('reproduces Appendix A, including the partial payment (balance 728.66)', () => {
    expect(calculate({ totalPaid: '1451.34' })).toMatchObject({
      totalAmount: '2180.00',
      totalPaid: '1451.34',
      balanceAmount: '728.66',
    });
  });

  it('rounds half-up to cents where binary floating point rounds down', () => {
    // 3 × 33.335 = 100.005 exactly, but as a double it is 100.00499… and toFixed(2) yields "100.00".
    expect((33.335 * 3).toFixed(2)).toBe('100.00');
    expect(
      calculate({ items: [{ quantity: 3, rate: '33.335' }], taxRate: 0, discount: 0 }),
    ).toMatchObject({
      lineAmounts: ['100.01'],
      totalAmount: '100.01',
    });
  });

  it('rounds the tax once, on the subtotal, half-up: 100.05 × 10 % = 10.005 → 10.01', () => {
    expect(calculate({ items: [{ quantity: 3, rate: 33.35 }], discount: 0.05 })).toMatchObject({
      subTotal: '100.05',
      taxAmount: '10.01',
      totalAmount: '110.01',
    });
  });

  it('handles a 0 % tax rate', () => {
    expect(calculate({ taxRate: 0, discount: 0 })).toMatchObject({
      taxAmount: '0.00',
      totalAmount: '2000.00',
    });
  });

  it('handles fractional tax rates', () => {
    expect(
      calculate({ items: [{ quantity: 1, rate: 199.99 }], taxRate: 7.25, discount: 0 }),
    ).toMatchObject({
      taxAmount: '14.50', // 14.499275 → 14.50
      totalAmount: '214.49',
    });
  });

  it('allows a discount equal to subtotal plus tax (total 0)', () => {
    expect(calculate({ discount: 2200 })).toMatchObject({
      totalAmount: '0.00',
      balanceAmount: '0.00',
    });
  });

  it('rejects a discount greater than subtotal plus tax', () => {
    expect(() => calculate({ discount: 2200.01 })).toThrow(
      new InvoiceCalculationError(DISCOUNT_EXCEEDS_TOTAL),
    );
  });

  it('keeps large amounts exact where floats drift', () => {
    expect(9999 * 99_999_999.99).toBe(999_899_999_900.0099); // IEEE 754 drift
    expect(
      calculate({ items: [{ quantity: 9999, rate: 99_999_999.99 }], taxRate: 0, discount: 0 }),
    ).toMatchObject({ totalAmount: '999899999900.01' });

    expect(1_234_567.89 * 7).toBe(8_641_975.229999999);
    expect(
      calculate({ items: [{ quantity: 7, rate: 1_234_567.89 }], taxRate: 0, discount: 0 }),
    ).toMatchObject({
      totalAmount: '8641975.23',
    });
  });

  it('sums several line items (the model supports more than one)', () => {
    expect(
      calculate({
        items: [
          { quantity: 2, rate: 10.1 },
          { quantity: 1, rate: 0.2 },
        ],
        taxRate: 0,
        discount: 0,
      }),
    ).toMatchObject({ lineAmounts: ['20.20', '0.20'], subTotal: '20.40' });
  });

  it('rejects totals that do not fit numeric(14,2)', () => {
    expect(() =>
      calculate({ items: [{ quantity: 1_000_000, rate: 1_000_000_000 }], discount: 0 }),
    ).toThrow(new InvoiceCalculationError(TOTAL_EXCEEDS_MAXIMUM));
  });

  it('rejects a payment larger than the total', () => {
    expect(() => calculate({ totalPaid: '2180.01' })).toThrow(
      new InvoiceCalculationError(PAYMENT_EXCEEDS_TOTAL),
    );
  });

  it('rounds a tax of exactly half a cent up: 0.05 × 10 % = 0.005 → 0.01', () => {
    expect(calculate({ items: [{ quantity: 1, rate: 0.05 }], discount: 0 })).toMatchObject({
      taxAmount: '0.01',
      totalAmount: '0.06',
    });
  });

  it('rounds the tax half-up where float arithmetic rounds down: 1.45 × 10 % = 0.145 → 0.15', () => {
    // What a naive implementation would compute from the JSON numbers.
    expect(((1.45 * 10) / 100).toFixed(2)).toBe('0.14');
    expect(Math.round(((1.45 * 10) / 100) * 100) / 100).toBe(0.14);

    expect(calculate({ items: [{ quantity: 1, rate: 1.45 }], discount: 0 })).toMatchObject({
      taxAmount: '0.15',
      totalAmount: '1.60',
    });
  });

  it('settles to a zero balance when the invoice is paid in full', () => {
    expect(calculate({ totalPaid: '2180.00' })).toMatchObject({
      totalPaid: '2180.00',
      balanceAmount: '0.00',
    });
  });

  it('accepts a total of exactly 999 999 999 999.99, the largest value numeric(14,2) stores', () => {
    expect(
      calculate({ items: [{ quantity: 1, rate: '999999999999.99' }], taxRate: 0, discount: 0 }),
    ).toMatchObject({ totalAmount: '999999999999.99' });
  });

  it('rejects a total one cent above the maximum as a business-rule violation (HTTP 400, not a 500)', () => {
    const oneCentTooMuch = () =>
      calculate({
        items: [
          { quantity: 1, rate: '999999999999.99' },
          { quantity: 1, rate: '0.01' },
        ],
        taxRate: 0,
        discount: 0,
      });

    expect(oneCentTooMuch).toThrow(new InvoiceCalculationError(TOTAL_EXCEEDS_MAXIMUM));
    expect(oneCentTooMuch).toThrow(BusinessRuleViolationError);
  });

  it('rejects a subtotal that only exceeds the maximum once the tax is added', () => {
    // 1000 × 999 999 999.99 = 999 999 999 990.00 fits; +10 % tax does not.
    expect(() =>
      calculate({ items: [{ quantity: 1000, rate: 999_999_999.99 }], taxRate: 10, discount: 0 }),
    ).toThrow(new InvoiceCalculationError(TOTAL_EXCEEDS_MAXIMUM));
  });
});
