import { describe, expect, it } from 'vitest';
import { addDays, isValidIsoDate, parseIsoDate, todayIsoDate } from './calendar-date';

describe('parseIsoDate', () => {
  it('parses a calendar date as UTC midnight', () => {
    expect(parseIsoDate('2026-06-03')?.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-6-3',
    '03/06/2026',
    '2026-06-03T00:00:00Z',
    '',
  ])('rejects %j', (value) => {
    expect(parseIsoDate(value)).toBeUndefined();
  });
});

describe('todayIsoDate', () => {
  it('uses the local calendar date rather than the UTC one', () => {
    // 00:30 local time on 1 March — in UTC that is still 28 February east of Greenwich.
    expect(todayIsoDate(new Date(2026, 2, 1, 0, 30))).toBe('2026-03-01');
  });
});

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-09-29', 30)).toBe('2026-10-29');
    expect(addDays('2026-12-15', 30)).toBe('2027-01-14');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('refuses an invalid date', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});
