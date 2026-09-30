import { addDays, isCalendarDate, toCalendarDate } from './calendar-date';

describe('isCalendarDate', () => {
  it.each([
    '2026-09-29',
    '2026-02-28',
    '2024-02-29',
    '2000-02-29', // divisible by 400: leap year
    '2026-12-31',
    '0001-01-01',
    '9999-12-31',
  ])('accepts %s', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    '2026-02-29', // not a leap year
    '1900-02-29', // century years are not leap years...
    '2100-02-29', // ...unless divisible by 400
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '0000-01-01', // no year zero in PostgreSQL
    '2026-1-5',
    '26-01-05',
    '2026/01/05',
    '2026-01-05T00:00:00Z',
    ' 2026-01-05',
    '',
  ])('rejects %p', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  it.each([20260105, null, undefined, new Date('2026-01-05')])(
    'rejects non-strings (%p)',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );
});

describe('toCalendarDate', () => {
  const evening = new Date('2026-09-29T20:30:00Z');
  const earlyMorning = new Date('2026-09-29T02:00:00Z');

  it('uses the calendar of the given time zone, not the server one', () => {
    expect(toCalendarDate(evening, 'UTC')).toBe('2026-09-29');
    expect(toCalendarDate(evening, 'Asia/Ho_Chi_Minh')).toBe('2026-09-30');
    expect(toCalendarDate(earlyMorning, 'America/Los_Angeles')).toBe('2026-09-28');
  });

  it('turns to the next day exactly at local midnight', () => {
    expect(toCalendarDate(new Date('2026-09-29T16:59:59.999Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-09-29',
    );
    expect(toCalendarDate(new Date('2026-09-29T17:00:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-09-30',
    );
  });

  it('can put one instant on calendar dates two days apart (UTC+14 vs UTC-11)', () => {
    const instant = new Date('2026-09-29T10:30:00Z');

    expect(toCalendarDate(instant, 'Pacific/Kiritimati')).toBe('2026-09-30');
    expect(toCalendarDate(instant, 'Pacific/Pago_Pago')).toBe('2026-09-28');
  });

  it('keeps leap days', () => {
    expect(toCalendarDate(new Date('2028-02-29T12:00:00Z'), 'UTC')).toBe('2028-02-29');
  });
});

describe('addDays', () => {
  it('moves across month, leap-day and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-09-29', 0)).toBe('2026-09-29');
    expect(addDays('2026-09-29', 365)).toBe('2027-09-29');
  });

  it('counts leap days when going back in time and across a year from 29 February', () => {
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2023-03-01', -1)).toBe('2023-02-28');
    expect(addDays('2024-02-29', 365)).toBe('2025-02-28');
  });

  it('ignores daylight-saving changes (calendar days, not 24-hour periods)', () => {
    // Clocks change in Sydney on 2026-10-04 and in Los Angeles on 2026-11-01.
    expect(addDays('2026-10-03', 2)).toBe('2026-10-05');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
  });
});
