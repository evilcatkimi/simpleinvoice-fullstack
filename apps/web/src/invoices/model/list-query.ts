import { z } from 'zod';
import { isValidIsoDate } from '@/core/calendar/calendar-date';
import { replaceControlCharacters } from '@/core/validation/control-characters';
import { INVOICE_STATUSES, SORT_FIELDS, SORT_ORDERS } from './invoice';

export const PAGE_SIZES = [10, 20, 50] as const;

/** The API's limit; the search box enforces it too (`maxLength`). */
export const KEYWORD_MAX_LENGTH = 100;

/** The API rejects larger page numbers with a 400. */
const MAX_PAGE = 100_000;

const isoDate = z.string().refine(isValidIsoDate);

/**
 * The invoice list state lives in the URL query string (shareable, survives refresh, works with
 * back/forward). Every field falls back to its default instead of failing, so a hand-edited or
 * stale link still renders a sensible list rather than an error.
 */
const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(MAX_PAGE).catch(1),
    pageSize: z.coerce.number().pipe(z.literal(PAGE_SIZES)).catch(10),
    sortBy: z.enum(SORT_FIELDS).catch('invoiceDate'),
    ordering: z.string().toUpperCase().pipe(z.enum(SORT_ORDERS)).catch('DESC'),
    status: z.enum(INVOICE_STATUSES).optional().catch(undefined),
    keyword: z
      .string()
      // The API rejects control characters; a pasted tab or line break becomes a plain space.
      .overwrite(replaceControlCharacters)
      .trim()
      .max(KEYWORD_MAX_LENGTH)
      .transform((keyword) => keyword || undefined)
      .optional()
      .catch(undefined),
    fromDate: isoDate.optional().catch(undefined),
    toDate: isoDate.optional().catch(undefined),
  })
  // The API rejects an inverted range with a 400; drop it rather than fail the whole list.
  .transform((params) =>
    params.fromDate && params.toDate && params.fromDate > params.toDate
      ? { ...params, fromDate: undefined, toDate: undefined }
      : params,
  );

export type InvoiceListQuery = z.output<typeof listQuerySchema>;

export const DEFAULT_LIST_QUERY: InvoiceListQuery = listQuerySchema.parse({});

export function parseListQuery(searchParams: URLSearchParams): InvoiceListQuery {
  return listQuerySchema.parse(Object.fromEntries(searchParams));
}

/** Serialises params for the address bar, leaving defaults out to keep URLs short. */
export function toSearchParams(params: InvoiceListQuery): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const key of Object.keys(params) as (keyof InvoiceListQuery)[]) {
    const value = params[key];
    if (value !== undefined && value !== DEFAULT_LIST_QUERY[key]) {
      searchParams.set(key, String(value));
    }
  }
  return searchParams;
}

export function hasActiveFilters({ status, keyword, fromDate, toDate }: InvoiceListQuery): boolean {
  return [status, keyword, fromDate, toDate].some((value) => value !== undefined);
}
