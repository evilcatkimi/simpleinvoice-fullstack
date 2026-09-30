/**
 * Supported ISO 4217 currencies. The display symbol is always derived from this table on the server, so clients
 * cannot store an inconsistent code/symbol pair.
 */
export const SUPPORTED_CURRENCIES = [
  { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar' },
  { code: 'USD', symbol: 'US$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export type CurrencyCode = Currency['code'];

export const SUPPORTED_CURRENCY_CODES: readonly CurrencyCode[] = SUPPORTED_CURRENCIES.map(
  (currency) => currency.code,
);

export function findCurrency(code: string): Currency | undefined {
  return SUPPORTED_CURRENCIES.find((currency) => currency.code === code);
}
