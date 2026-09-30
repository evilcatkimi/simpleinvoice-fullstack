import type { InvoiceFilters, InvoiceSortField } from '../application/invoice.repository';
import type { InvoiceStatus } from '../domain/invoice-status';

export const INVOICE_ALIAS = 'invoice';

/**
 * Whitelisted mapping from API sort keys to entity properties: the client picks a key, never a column expression,
 * so nothing user-controlled is ever interpolated into SQL.
 */
export const SORT_COLUMNS: Record<InvoiceSortField, string> = {
  invoiceDate: `${INVOICE_ALIAS}.invoiceDate`,
  dueDate: `${INVOICE_ALIAS}.dueDate`,
  totalAmount: `${INVOICE_ALIAS}.totalAmount`,
};

/** Only the columns the list view needs (no description, customer contact details, tax breakdown, ...). */
export const INVOICE_SUMMARY_COLUMNS = [
  'id',
  'invoiceNumber',
  'invoiceReference',
  'invoiceDate',
  'dueDate',
  'currency',
  'currencySymbol',
  'customer.fullname',
  'customer.email',
  'totalAmount',
  'totalPaid',
  'balanceAmount',
  'status',
  'createdAt',
].map((property) => `${INVOICE_ALIAS}.${property}`);

/** A WHERE fragment with its named parameters (values are always bound, never concatenated). */
export interface SqlCondition {
  sql: string;
  params: Record<string, string>;
}

/**
 * SQL counterpart of `deriveInvoiceStatus` (domain/invoice-status.ts): Overdue is not stored, so each status filter has to be expressed against
 * the persisted status and the due date. `today` is bound as a parameter from the injected Clock (never
 * CURRENT_DATE, which would follow the database server's time zone and could not be frozen in tests).
 */
export function statusCondition(status: InvoiceStatus, today: string): SqlCondition {
  switch (status) {
    case 'Overdue':
      return {
        sql: `${INVOICE_ALIAS}.status <> :paidStatus AND ${INVOICE_ALIAS}.dueDate < :today`,
        params: { paidStatus: 'Paid', today },
      };
    case 'Paid':
      return { sql: `${INVOICE_ALIAS}.status = :status`, params: { status } };
    case 'Draft':
    case 'Pending':
      // A Draft/Pending invoice past its due date is reported as Overdue, so it must not match its stored status.
      return {
        sql: `${INVOICE_ALIAS}.status = :status AND ${INVOICE_ALIAS}.dueDate >= :today`,
        params: { status, today },
      };
  }
}

/** Escapes LIKE wildcards so user input is matched literally (paired with `ESCAPE '\'`). */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Case-insensitive partial match on invoice number or customer name (both backed by pg_trgm GIN indexes). */
export function keywordCondition(keyword: string): SqlCondition {
  return {
    sql:
      `(${INVOICE_ALIAS}.invoiceNumber ILIKE :keyword ESCAPE '\\' ` +
      `OR ${INVOICE_ALIAS}.customer.fullname ILIKE :keyword ESCAPE '\\')`,
    params: { keyword: `%${escapeLikePattern(keyword)}%` },
  };
}

export function buildInvoiceListConditions(filters: InvoiceFilters, today: string): SqlCondition[] {
  const conditions: SqlCondition[] = [];
  if (filters.status) {
    conditions.push(statusCondition(filters.status, today));
  }
  if (filters.keyword) {
    conditions.push(keywordCondition(filters.keyword));
  }
  if (filters.fromDate) {
    conditions.push({
      sql: `${INVOICE_ALIAS}.invoiceDate >= :fromDate`,
      params: { fromDate: filters.fromDate },
    });
  }
  if (filters.toDate) {
    conditions.push({
      sql: `${INVOICE_ALIAS}.invoiceDate <= :toDate`,
      params: { toDate: filters.toDate },
    });
  }
  return conditions;
}
