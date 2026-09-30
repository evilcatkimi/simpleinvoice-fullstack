import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../../../shared/validation/validation-pipe';
import { ListInvoicesQueryDto } from './list-invoices-query.dto';

const pipe = createValidationPipe();

/** A parsed query string: Express turns `?page=1&page=2` into an array. */
type RawQuery = Record<string, string | string[]>;

function parse(query: RawQuery): Promise<ListInvoicesQueryDto> {
  return pipe.transform(query, {
    type: 'query',
    metatype: ListInvoicesQueryDto,
  }) as Promise<ListInvoicesQueryDto>;
}

async function errorsFor(query: RawQuery): Promise<string[]> {
  try {
    await parse(query);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
}

describe('ListInvoicesQueryDto validation', () => {
  it('applies the documented defaults', async () => {
    expect(await parse({})).toEqual(
      Object.assign(new ListInvoicesQueryDto(), {
        page: 1,
        pageSize: 10,
        sortBy: 'invoiceDate',
        ordering: 'DESC',
      }),
    );
  });

  it('converts query strings and accepts ordering in any case', async () => {
    expect(
      await parse({ page: '2', pageSize: '25', sortBy: 'totalAmount', ordering: 'asc' }),
    ).toMatchObject({
      page: 2,
      pageSize: 25,
      sortBy: 'totalAmount',
      ordering: 'ASC',
    });
  });

  it('normalises ordering whatever its letter case or surrounding spaces', async () => {
    expect((await parse({ ordering: ' Desc ' })).ordering).toBe('DESC');
    expect((await parse({ ordering: 'aSc' })).ordering).toBe('ASC');
  });

  it('accepts the documented upper bounds', async () => {
    expect(await parse({ page: '100000', pageSize: '100' })).toMatchObject({
      page: 100_000,
      pageSize: 100,
    });
  });

  it.each([
    [{ page: '0' }, 'page must not be less than 1'],
    [{ page: 'abc' }, 'page must be an integer number'],
    [{ page: '1.5' }, 'page must be an integer number'],
    [{ page: '100001' }, 'page must not be greater than 100000'],
    [{ pageSize: '101' }, 'pageSize must not be greater than 100'],
    [{ pageSize: '0' }, 'pageSize must not be less than 1'],
    [
      { sortBy: 'customerName' },
      'sortBy must be one of the following values: invoiceDate, dueDate, totalAmount',
    ],
    [{ ordering: 'sideways' }, 'ordering must be one of the following values: ASC, DESC'],
    [
      { status: 'Cancelled' },
      'status must be one of the following values: Draft, Pending, Paid, Overdue',
    ],
    [{ fromDate: '2026-02-30' }, 'fromDate must be a valid date in YYYY-MM-DD format'],
    [{ keyword: 'x'.repeat(101) }, 'keyword must be shorter than or equal to 100 characters'],
  ])('rejects %p', async (query, message) => {
    expect(await errorsFor(query)).toContain(message);
  });

  it('rejects a date range that ends before it starts', async () => {
    expect(await errorsFor({ fromDate: '2026-09-30', toDate: '2026-09-01' })).toEqual([
      'toDate must be on or after fromDate',
    ]);
    expect(await errorsFor({ fromDate: '2026-09-30', toDate: '2026-09-30' })).toEqual([]);
  });

  it('trims the keyword and ignores a blank one', async () => {
    expect((await parse({ keyword: '  paul ' })).keyword).toBe('paul');
    expect((await parse({ keyword: '   ' })).keyword).toBeUndefined();
  });

  it('measures the keyword limit after trimming', async () => {
    expect((await parse({ keyword: ` ${'x'.repeat(100)} ` })).keyword).toHaveLength(100);
  });

  it('keeps LIKE wildcards in the keyword verbatim (they are escaped in SQL, not rejected)', async () => {
    expect((await parse({ keyword: '100%_off\\' })).keyword).toBe('100%_off\\');
  });

  it('answers 400, not 500, for a keyword with a NUL byte (PostgreSQL refuses it in text)', async () => {
    expect(await errorsFor({ keyword: 'abc\u0000def' })).toEqual([
      'keyword must not contain control characters',
    ]);
  });

  it('accepts an open-ended date range', async () => {
    expect(await errorsFor({ fromDate: '2026-09-01' })).toEqual([]);
    expect(await errorsFor({ toDate: '2026-09-30' })).toEqual([]);
  });

  it.each([
    ['page', ['1', '2']],
    ['pageSize', ['10', '100']],
    ['ordering', ['asc', 'desc']],
    ['sortBy', ['dueDate', 'totalAmount']],
    ['status', ['Paid', 'Draft']],
    ['keyword', ['paul', 'jane']],
    ['fromDate', ['2026-01-01', '2026-02-01']],
  ])('answers 400, not 500, when %s is repeated in the query string', async (name, values) => {
    expect((await errorsFor({ [name]: values })).length).toBeGreaterThan(0);
  });

  it('rejects unknown query parameters', async () => {
    expect(await errorsFor({ limit: '10' })).toEqual(['property limit should not exist']);
  });
});
