/**
 * Calendar dates (invoiceDate, dueDate, "today") are plain `YYYY-MM-DD` strings end to end: they have no time zone,
 * so they never go through JavaScript `Date` objects whose local-midnight semantics can shift the day. ISO calendar
 * dates also compare correctly as strings, which the Overdue rule relies on.
 */
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as `YYYY-MM-DD` (rejects 2026-02-30, 2026-13-01, 2026-1-5, ...). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Year 0 does not exist in PostgreSQL's calendar; setUTCFullYear (unlike Date.UTC) handles years below 100.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** The calendar date of `instant` as observed in the IANA `timeZone`. */
export function toCalendarDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Shifts a `YYYY-MM-DD` date by a whole number of days (negative values go back in time). */
export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
