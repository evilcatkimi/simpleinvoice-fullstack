import { deriveInvoiceStatus } from '../../../modules/invoices/domain/invoice-status';
import { addDays } from '../../../shared/dates/calendar-date';
import { generateInvoices, type GenerateInvoicesOptions } from './invoice-generator';
import { toInvoiceRow } from '../../../modules/invoices/infrastructure/invoice-persistence.mapper';
import { toSeededInvoice } from './seed-invoice';

const options: GenerateInvoicesOptions = {
  count: 40,
  today: '2026-09-29',
  now: new Date('2026-09-29T10:00:00.000Z'),
  seed: 101,
};

describe('generateInvoices', () => {
  const invoices = generateInvoices(options);

  it('is deterministic for a given seed and date', () => {
    expect(generateInvoices(options)).toEqual(invoices);
    expect(generateInvoices({ ...options, seed: 7 })).not.toEqual(invoices);
  });

  it('keeps ids and invoice numbers stable whatever day the seed runs (re-seeding is a no-op)', () => {
    const nextMonth = generateInvoices({
      ...options,
      today: '2026-10-29',
      now: new Date('2026-10-29T10:00:00.000Z'),
    });

    const identities = (list: typeof invoices) =>
      list.map(({ id, invoiceNumber, item }) => [id, invoiceNumber, item.id]);
    expect(identities(nextMonth)).toEqual(identities(invoices));
  });

  it('produces unique invoice numbers and ids', () => {
    expect(new Set(invoices.map((invoice) => invoice.invoiceNumber)).size).toBe(40);
    expect(new Set(invoices.map((invoice) => invoice.id)).size).toBe(40);
    expect(invoices[0].invoiceNumber).toBe('INV-2026-0001');
  });

  it('balances the stored statuses and never stores Overdue', () => {
    const counts = invoices.reduce<Record<string, number>>((acc, invoice) => {
      acc[invoice.status] = (acc[invoice.status] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({ Draft: 14, Pending: 13, Paid: 13 });
  });

  it('dates invoices within the last year with due dates 7–60 days later', () => {
    for (const invoice of invoices) {
      expect(invoice.invoiceDate >= addDays(options.today, -364)).toBe(true);
      expect(invoice.invoiceDate <= options.today).toBe(true);
      expect(invoice.dueDate >= addDays(invoice.invoiceDate, 7)).toBe(true);
      expect(invoice.dueDate <= addDays(invoice.invoiceDate, 60)).toBe(true);
      expect(invoice.createdAt.getTime()).toBeLessThanOrEqual(options.now.getTime());
    }
  });

  it('makes every status filter meaningful, including Overdue', () => {
    const derived = new Set(
      invoices.map((invoice) =>
        deriveInvoiceStatus(invoice.status, invoice.dueDate, options.today),
      ),
    );

    expect(derived).toEqual(new Set(['Draft', 'Pending', 'Paid', 'Overdue']));
  });

  it('fully pays Paid invoices and never over-pays the others', () => {
    for (const invoice of invoices) {
      const row = toInvoiceRow(toSeededInvoice(invoice, 'ad1e0902-1928-4345-b513-60c86c94fc91'));
      if (invoice.status === 'Paid') {
        expect(row.totalPaid).toBe(row.totalAmount);
        expect(row.balanceAmount).toBe('0.00');
      } else if (invoice.status === 'Draft') {
        expect(row.totalPaid).toBe('0.00');
      }
      expect(Number(row.balanceAmount)).toBeGreaterThanOrEqual(0);
    }
    expect(
      invoices.some((invoice) => invoice.status === 'Pending' && invoice.totalPaid !== '0.00'),
    ).toBe(true);
  });
});
