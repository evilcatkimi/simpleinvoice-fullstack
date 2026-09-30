import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  pluralise,
} from './format';

describe('formatMoney', () => {
  const aud = { currency: 'AUD', currencySymbol: 'AU$' };

  it('prefixes the symbol the API sends with the invoice', () => {
    expect(formatMoney(2180, aud)).toBe('AU$2,180.00');
    expect(formatMoney(1451.34, { currency: 'USD', currencySymbol: 'US$' })).toBe('US$1,451.34');
    expect(formatMoney(0.5, { currency: 'GBP', currencySymbol: '£' })).toBe('£0.50');
    expect(formatMoney(1234567.8, { currency: 'EUR', currencySymbol: '€' })).toBe('€1,234,567.80');
  });

  it('keeps the two decimals the API stores, even for zero-decimal currencies', () => {
    expect(formatMoney(1000.5, { currency: 'VND', currencySymbol: '₫' })).toBe('₫1,000.50');
  });

  it.each([
    ['AUD', 'AU$', 'AU$1,234.50'],
    ['USD', 'US$', 'US$1,234.50'],
    ['GBP', '£', '£1,234.50'],
    ['EUR', '€', '€1,234.50'],
    ['SGD', 'S$', 'S$1,234.50'],
    ['NZD', 'NZ$', 'NZ$1,234.50'],
    ['CAD', 'CA$', 'CA$1,234.50'],
    ['VND', '₫', '₫1,234.50'],
  ])(
    'shows every supported currency with its API symbol: %s → %s',
    (currency, currencySymbol, formatted) => {
      expect(formatMoney(1234.5, { currency, currencySymbol })).toBe(formatted);
    },
  );

  it('prints zero and the largest storable amount exactly', () => {
    expect(formatMoney(0, aud)).toBe('AU$0.00');
    expect(formatMoney(999_999_999_999.99, aud)).toBe('AU$999,999,999,999.99');
  });

  it.each([undefined, null, '', '   '])(
    'falls back to the ISO code when the symbol is %j',
    (currencySymbol) => {
      // A no-break space keeps the code and the digits on one line.
      expect(formatMoney(2180, { currency: 'AUD', currencySymbol })).toBe('AUD\u00a02,180.00');
    },
  );
});

describe('formatDate', () => {
  it('prints calendar dates exactly, without a time-zone shift', () => {
    expect(formatDate('2026-06-03')).toBe('3 Jun 2026');
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('returns the raw value when it is not a real calendar date', () => {
    expect(formatDate('2026-02-30')).toBe('2026-02-30');
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateTime', () => {
  it('formats an instant in the local time zone', () => {
    // The exact day/time depends on the machine's zone; month and year cannot change here.
    expect(formatDateTime('2026-06-15T12:00:00.000Z')).toMatch(/Jun 2026/);
  });

  it('returns the raw value when it cannot be parsed', () => {
    expect(formatDateTime('yesterday')).toBe('yesterday');
  });
});

describe('formatNumber / formatPercent', () => {
  it('groups thousands and keeps up to two decimals', () => {
    expect(formatNumber(1000000)).toBe('1,000,000');
    expect(formatPercent(10)).toBe('10%');
    expect(formatPercent(7.25)).toBe('7.25%');
  });
});

describe('pluralise', () => {
  it('uses the singular for exactly one, the plural otherwise', () => {
    expect(pluralise(1, 'invoice')).toBe('invoice');
    expect(pluralise(0, 'invoice')).toBe('invoices');
    expect(pluralise(25, 'page')).toBe('pages');
  });
});
