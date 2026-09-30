import {
  deriveInvoiceStatus,
  withEffectiveStatus,
  type PersistedInvoiceStatus,
} from './invoice-status';

describe('deriveInvoiceStatus', () => {
  const today = '2026-09-29';

  it.each<[PersistedInvoiceStatus, string, string]>([
    ['Draft', '2026-09-28', 'Overdue'],
    ['Pending', '2026-09-28', 'Overdue'],
    ['Draft', '2026-09-29', 'Draft'],
    ['Pending', '2026-09-29', 'Pending'],
    ['Draft', '2026-09-30', 'Draft'],
    ['Pending', '2026-12-31', 'Pending'],
  ])('%s invoice due %s is %s', (persisted, dueDate, expected) => {
    expect(deriveInvoiceStatus(persisted, dueDate, today)).toBe(expected);
  });

  it('never reports a Paid invoice as Overdue', () => {
    expect(deriveInvoiceStatus('Paid', '2020-01-01', today)).toBe('Paid');
    expect(deriveInvoiceStatus('Paid', '2026-12-31', today)).toBe('Paid');
  });

  it('treats an invoice due today as not yet overdue', () => {
    expect(deriveInvoiceStatus('Pending', today, today)).toBe('Pending');
  });

  it('withEffectiveStatus replaces the stored status and keeps every other field', () => {
    const invoice = { id: 'x', status: 'Draft' as const, dueDate: '2026-09-28' };

    expect(withEffectiveStatus(invoice, today)).toEqual({ ...invoice, status: 'Overdue' });
    expect(invoice.status).toBe('Draft');
  });

  it('compares calendar dates correctly across month and year boundaries', () => {
    expect(deriveInvoiceStatus('Pending', '2025-12-31', '2026-01-01')).toBe('Overdue');
    expect(deriveInvoiceStatus('Pending', '2026-02-28', '2026-03-01')).toBe('Overdue');
    expect(deriveInvoiceStatus('Pending', '2026-10-01', '2026-09-30')).toBe('Pending');
  });
});
