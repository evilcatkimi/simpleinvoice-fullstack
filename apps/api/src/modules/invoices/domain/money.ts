import Decimal from 'decimal.js';

/**
 * Decimal constructor for all money arithmetic. Binary floats cannot represent most cents exactly
 * (0.1 + 0.2 !== 0.3), so amounts are never computed with `number`.
 * - precision 34 (IEEE 754 decimal128): products such as subTotal × taxRate never lose digits before rounding;
 * - ROUND_HALF_UP: the commercial rounding customers expect (x.xx5 rounds away from zero).
 */
export const Money = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

const MONEY_SCALE = 2;

/** Largest amount a numeric(14,2) column can store. */
export const MAX_MONEY_AMOUNT = new Money('999999999999.99');

export function roundMoney(value: Decimal.Value): Decimal {
  return new Money(value).toDecimalPlaces(MONEY_SCALE);
}

/** Persistence edge: numeric columns are written as exact decimal strings. */
export function toMoneyString(value: Decimal.Value): string {
  return new Money(value).toFixed(MONEY_SCALE);
}

/**
 * API edge: the contract exposes money as JSON numbers with at most two decimals. numeric(14,2) values have at most
 * 14 significant digits and every decimal with ≤ 15 significant digits round-trips exactly through a double, so
 * `728.66` is serialised as `728.66` (and `2180.00` as `2180`).
 */
export function toMoneyNumber(value: Decimal.Value): number {
  return roundMoney(value).toNumber();
}
