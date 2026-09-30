import { MAX_MONEY_AMOUNT, Money, roundMoney, toMoneyNumber, toMoneyString } from './money';

describe('money helpers', () => {
  it('rounds half-up to two decimals', () => {
    expect(roundMoney('1.005').toFixed(2)).toBe('1.01');
    expect(roundMoney('1.004').toFixed(2)).toBe('1.00');
    expect(roundMoney('-1.005').toFixed(2)).toBe('-1.01');
  });

  it('rounds half a cent up, never to even (banker’s rounding would give 0.02 for 0.025)', () => {
    expect(roundMoney('0.005').toFixed(2)).toBe('0.01');
    expect(roundMoney('0.015').toFixed(2)).toBe('0.02');
    expect(roundMoney('0.025').toFixed(2)).toBe('0.03');
  });

  it('rounds JSON numbers as written, not as their binary approximation', () => {
    // 1.005 is stored as 1.00499999999999989… in binary, so the usual float idioms round it down.
    expect((1.005).toFixed(2)).toBe('1.00');
    expect(Math.round(1.005 * 100) / 100).toBe(1);

    expect(roundMoney(1.005).toFixed(2)).toBe('1.01');
  });

  it('never hands more than two decimals to API clients', () => {
    expect(toMoneyNumber('0.125')).toBe(0.13);
    expect(toMoneyNumber(new Money('0.1').plus('0.2'))).toBe(0.3);
  });

  it('caps amounts at the largest numeric(14,2) value: 12 integer digits and 2 decimals', () => {
    expect(MAX_MONEY_AMOUNT.toFixed(2)).toBe('999999999999.99');
    expect(MAX_MONEY_AMOUNT.precision(true)).toBe(14);
  });

  it('writes numeric column values as exact 2-dp strings', () => {
    expect(toMoneyString(10)).toBe('10.00');
    expect(toMoneyString('150.5')).toBe('150.50');
    expect(toMoneyString(MAX_MONEY_AMOUNT)).toBe('999999999999.99');
  });

  it('converts PostgreSQL numeric strings to JSON numbers', () => {
    expect(toMoneyNumber('2180.00')).toBe(2180);
    expect(toMoneyNumber('728.66')).toBe(728.66);
    expect(toMoneyNumber('999999999999.99')).toBe(999999999999.99);
  });
});
