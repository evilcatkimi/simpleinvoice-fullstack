/** Statuses stored in the database (PostgreSQL enum `invoice_status`). */
export const PERSISTED_INVOICE_STATUSES = ['Draft', 'Pending', 'Paid'] as const;
export type PersistedInvoiceStatus = (typeof PERSISTED_INVOICE_STATUSES)[number];

/** Statuses exposed by the API. Overdue is derived at read time and never stored. */
export const INVOICE_STATUSES = [...PERSISTED_INVOICE_STATUSES, 'Overdue'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * An invoice that is not Paid becomes Overdue the day after its due date: an invoice due today is not overdue yet.
 * Both dates are ISO calendar dates (`YYYY-MM-DD`), which compare correctly as strings; `today` comes from the
 * injected Clock in the configured APP_TIMEZONE.
 *
 * The list filter expresses the same rule in SQL (infrastructure/invoice-list.query.ts).
 */
export function deriveInvoiceStatus(
  persisted: PersistedInvoiceStatus,
  dueDate: string,
  today: string,
): InvoiceStatus {
  return persisted !== 'Paid' && dueDate < today ? 'Overdue' : persisted;
}

/** Anything carrying a stored status and a due date: a full invoice or a list summary. */
interface StatusSource {
  status: PersistedInvoiceStatus;
  dueDate: string;
}

/** A stored invoice as readers see it on a given day: the persisted status replaced by the effective one. */
export type WithEffectiveStatus<T extends StatusSource> = Omit<T, 'status'> & {
  status: InvoiceStatus;
};

export function withEffectiveStatus<T extends StatusSource>(
  invoice: T,
  today: string,
): WithEffectiveStatus<T> {
  return { ...invoice, status: deriveInvoiceStatus(invoice.status, invoice.dueDate, today) };
}
