/**
 * Helpers for calendar dates exchanged with the API as "YYYY-MM-DD" strings.
 *
 * A calendar date has no time zone. `new Date('2026-06-03')` is UTC midnight, which is still
 * June 2 anywhere west of Greenwich — so parsing stays in UTC and "today" is read from local parts.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "YYYY-MM-DD" into a UTC-midnight Date, or `undefined` if it is not a real calendar day. */
export function parseIsoDate(value: string): Date | undefined {
  const match = ISO_DATE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC silently rolls invalid days over (Feb 30 → Mar 2); the round trip rejects them.
  const isSameDay =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isSameDay ? date : undefined;
}

export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== undefined;
}

/** The user's current calendar date (local time zone, not UTC). */
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  if (!date) throw new RangeError(`Invalid calendar date: ${isoDate}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
