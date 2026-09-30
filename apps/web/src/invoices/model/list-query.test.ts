import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIST_QUERY,
  hasActiveFilters,
  KEYWORD_MAX_LENGTH,
  parseListQuery,
  toSearchParams,
} from './list-query';

const parse = (query: string) => parseListQuery(new URLSearchParams(query));

describe('parseListQuery', () => {
  it('uses the API defaults for an empty query string', () => {
    expect(parse('')).toEqual({ page: 1, pageSize: 10, sortBy: 'invoiceDate', ordering: 'DESC' });
  });

  it('reads every supported parameter', () => {
    expect(
      parse(
        'page=3&pageSize=50&sortBy=totalAmount&ordering=asc&status=Paid&keyword=%20Paul%20&fromDate=2026-01-01&toDate=2026-01-31',
      ),
    ).toEqual({
      page: 3,
      pageSize: 50,
      sortBy: 'totalAmount',
      ordering: 'ASC',
      status: 'Paid',
      keyword: 'Paul',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });
  });

  it('falls back field by field when values are invalid', () => {
    expect(
      parse(
        `page=0&pageSize=11&sortBy=name&ordering=up&status=Lost&fromDate=2026-02-30&keyword=${'x'.repeat(101)}`,
      ),
    ).toEqual(DEFAULT_LIST_QUERY);
    expect(parse('page=2.5&pageSize=abc')).toMatchObject({ page: 1, pageSize: 10 });
  });

  it('drops an inverted date range instead of sending it to the API', () => {
    expect(parse('fromDate=2026-02-01&toDate=2026-01-01')).toMatchObject({
      fromDate: undefined,
      toDate: undefined,
    });
  });

  it('accepts the ordering in any letter case, like the API', () => {
    expect(parse('ordering=asc').ordering).toBe('ASC');
    expect(parse('ordering=Desc').ordering).toBe('DESC');
  });

  it.each([
    ['a lower-case status', 'status=paid', { status: undefined }],
    ['a negative page', 'page=-2', { page: 1 }],
    ['an unsupported page size', 'pageSize=100', { pageSize: 10 }],
    ['a blank keyword', 'keyword=%20%20%20', { keyword: undefined }],
    ['a date without zero padding', 'fromDate=2026-1-5', { fromDate: undefined }],
  ])('falls back for %s', (_case, query, expected) => {
    expect(parse(query)).toMatchObject(expected);
  });

  it('keeps a valid bound when the other one is invalid', () => {
    expect(parse('fromDate=2026-01-01&toDate=2026-13-01')).toMatchObject({
      fromDate: '2026-01-01',
      toDate: undefined,
    });
  });

  it('keeps a keyword of exactly 100 characters (the API limit)', () => {
    expect(parse(`keyword=${'x'.repeat(KEYWORD_MAX_LENGTH)}`).keyword).toHaveLength(100);
  });

  // The API rejects control characters in the keyword with a 400; a pasted tab is just a space.
  it('turns control characters in the keyword into spaces', () => {
    expect(parse('keyword=%09paul%00smith%0A').keyword).toBe('paul smith');
    expect(parse('keyword=%1B%7F').keyword).toBeUndefined();
  });

  // The API rejects page > 100000 with a 400; a hand-edited link must not end on an error screen.
  it('falls back when the page is beyond what the API accepts', () => {
    expect(parse('page=100000').page).toBe(100_000);
    expect(parse('page=100001').page).toBe(1);
  });
});

describe('hasActiveFilters', () => {
  it('counts status, keyword and dates as filters, but not paging or sorting', () => {
    expect(hasActiveFilters(parse('page=3&pageSize=50&sortBy=dueDate&ordering=ASC'))).toBe(false);
    for (const filter of [
      'status=Paid',
      'keyword=paul',
      'fromDate=2026-01-01',
      'toDate=2026-01-31',
    ]) {
      expect(hasActiveFilters(parse(filter))).toBe(true);
    }
  });
});

describe('toSearchParams', () => {
  it('leaves defaults and empty filters out of the URL', () => {
    expect(toSearchParams(DEFAULT_LIST_QUERY).toString()).toBe('');
    expect(toSearchParams({ ...DEFAULT_LIST_QUERY, page: 2, status: 'Paid' }).toString()).toBe(
      'page=2&status=Paid',
    );
  });

  it('round-trips through parseListQuery', () => {
    const params = parse('page=2&pageSize=20&sortBy=dueDate&ordering=ASC&keyword=INV-00');
    expect(parseListQuery(toSearchParams(params))).toEqual(params);
  });

  it('encodes keywords with URL-significant characters so they survive the round trip', () => {
    const params = { ...DEFAULT_LIST_QUERY, keyword: 'A&B #1 100%+tax?' };

    const search = new URLSearchParams(toSearchParams(params).toString());

    // "&" did not start a second parameter and "#" did not cut the query string short.
    expect([...search.keys()]).toEqual(['keyword']);
    expect(parseListQuery(search)).toEqual(params);
  });
});
