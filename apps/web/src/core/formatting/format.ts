import { parseIsoDate } from '../calendar/calendar-date';

/**
 * Fixed display locale, so every user (and every test run) sees the same digit grouping and
 * day-month-year dates.
 */
const LOCALE = 'en-GB';

/** What money formatting needs from an invoice: its ISO-4217 code and the symbol the API sends. */
export interface MoneyCurrency {
  currency: string;
  currencySymbol?: string | null | undefined;
}

// The API stores 2 decimals for every currency, VND included, so exactly 2 are always shown.
const amountFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats an API amount with the invoice's own display symbol, e.g. "AU$2,180.00": the symbol is
 * part of the invoice data (spec §3.1), so the UI shows it rather than Intl's own ("A$").
 * Without a symbol it falls back to the ISO code, e.g. "AUD 2,180.00".
 */
export function formatMoney(amount: number, { currency, currencySymbol }: MoneyCurrency): string {
  const digits = amountFormatter.format(amount);
  const symbol = currencySymbol?.trim();
  // A no-break space keeps the code and the digits on one line.
  return symbol ? `${symbol}${digits}` : `${currency}\u00a0${digits}`;
}

const numberFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

/** Plain number with grouping (1000 → "1,000"). */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Noun form for a count, for regular English plurals: (1, 'invoice') → "invoice", (3, …) → "invoices". */
export function pluralise(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/** Formats a percentage stored as a plain number (10 → "10%"). */
export function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

// Calendar dates are parsed as UTC midnight, so they must be printed in UTC too.
const calendarDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

/** Formats a "YYYY-MM-DD" calendar date without any time-zone shift ("2026-06-03" → "3 Jun 2026"). */
export function formatDate(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  return date ? calendarDateFormatter.format(date) : isoDate;
}

const timestampFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Formats an ISO-8601 instant (e.g. `createdAt`) in the user's own time zone. */
export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? isoTimestamp : timestampFormatter.format(date);
}
