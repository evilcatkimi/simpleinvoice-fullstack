import {
  buildInvoiceListConditions,
  escapeLikePattern,
  keywordCondition,
  SORT_COLUMNS,
  statusCondition,
} from './invoice-list.query';

const today = '2026-09-29';

describe('statusCondition', () => {
  it('Overdue matches anything not Paid whose due date is before today', () => {
    expect(statusCondition('Overdue', today)).toEqual({
      sql: 'invoice.status <> :paidStatus AND invoice.dueDate < :today',
      params: { paidStatus: 'Paid', today },
    });
  });

  it('Paid matches the stored status only (a paid invoice is never overdue)', () => {
    expect(statusCondition('Paid', today)).toEqual({
      sql: 'invoice.status = :status',
      params: { status: 'Paid' },
    });
  });

  it.each(['Draft', 'Pending'] as const)(
    '%s excludes invoices past their due date, which are reported as Overdue',
    (status) => {
      expect(statusCondition(status, today)).toEqual({
        sql: 'invoice.status = :status AND invoice.dueDate >= :today',
        params: { status, today },
      });
    },
  );
});

describe('escapeLikePattern', () => {
  it('escapes LIKE wildcards and the escape character itself', () => {
    expect(escapeLikePattern('50%_off\\now')).toBe('50\\%\\_off\\\\now');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern("O'Connor INV-2026")).toBe("O'Connor INV-2026");
  });
});

describe('keywordCondition', () => {
  it('matches invoice number or customer name case-insensitively with a bound, literal pattern', () => {
    const condition = keywordCondition('100%');

    expect(condition.sql).toBe(
      "(invoice.invoiceNumber ILIKE :keyword ESCAPE '\\' OR invoice.customer.fullname ILIKE :keyword ESCAPE '\\')",
    );
    expect(condition.params).toEqual({ keyword: '%100\\%%' });
  });

  it('never interpolates the keyword into the SQL text', () => {
    expect(keywordCondition("'; DROP TABLE invoices; --").sql).not.toContain('DROP');
  });
});

describe('buildInvoiceListConditions', () => {
  it('returns no conditions when there are no filters', () => {
    expect(buildInvoiceListConditions({}, today)).toEqual([]);
  });

  it('combines status, keyword and the invoice-date range', () => {
    const conditions = buildInvoiceListConditions(
      { status: 'Pending', keyword: 'paul', fromDate: '2026-01-01', toDate: '2026-06-30' },
      today,
    );

    expect(conditions).toEqual([
      statusCondition('Pending', today),
      keywordCondition('paul'),
      { sql: 'invoice.invoiceDate >= :fromDate', params: { fromDate: '2026-01-01' } },
      { sql: 'invoice.invoiceDate <= :toDate', params: { toDate: '2026-06-30' } },
    ]);
  });
});

describe('SORT_COLUMNS', () => {
  it('maps each public sort key to an entity property', () => {
    expect(SORT_COLUMNS).toEqual({
      invoiceDate: 'invoice.invoiceDate',
      dueDate: 'invoice.dueDate',
      totalAmount: 'invoice.totalAmount',
    });
  });
});
