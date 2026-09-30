import { screen, within } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test-support/render-app';
import { parseIsoDate, todayIsoDate } from './calendar/calendar-date';
import { formatDate, formatDateTime } from './formatting/format';

/**
 * West of Greenwich, UTC midnight is still the previous day: exactly where "2026-01-01" would be
 * printed as 31 Dec 2025 by any code that mixes calendar dates with local time. vi.hoisted runs
 * before the imports, so every module (and the Intl formatters it creates) starts in this zone.
 */
vi.hoisted(() => {
  vi.stubEnv('TZ', 'America/Los_Angeles');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('in a time zone west of Greenwich (America/Los_Angeles)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs with the zone override active (UTC-8 in January)', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(480);
  });

  it('prints calendar dates on the day they denote', () => {
    // The trap: formatting the parsed date in local time moves it to the day before.
    expect(new Date('2026-01-01').toLocaleDateString('en-GB')).toBe('31/12/2025');

    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
    expect(formatDate('2028-02-29')).toBe('29 Feb 2028');
  });

  it('parses calendar dates at UTC midnight whatever the local zone', () => {
    expect(parseIsoDate('2026-01-01')?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('uses the local calendar day for "today" (6 pm on 31 December is not 1 January yet)', () => {
    expect(todayIsoDate(new Date('2026-01-01T02:00:00.000Z'))).toBe('2025-12-31');
  });

  it('shows instants such as createdAt in local time', () => {
    expect(formatDateTime('2026-01-01T02:00:00.000Z')).toBe('31 Dec 2025, 18:00');
  });

  it('lists an invoice dated 2026-01-01 on 1 January', async () => {
    renderApp('/invoices?ordering=ASC');

    const table = await screen.findByRole('table', { name: 'Invoices' });
    const firstRow = within(within(table).getAllByRole('row')[1]!);
    expect(firstRow.getByRole('link', { name: 'INV-0001' })).toBeInTheDocument();
    expect(firstRow.getByText('1 Jan 2026')).toBeInTheDocument();
    expect(firstRow.getByText('31 Jan 2026')).toBeInTheDocument();
  });

  it('pre-fills a new invoice with the local date, not the UTC one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T02:00:00.000Z')); // 18:00 on 31 Dec in Los Angeles
    renderApp('/invoices/new');

    await screen.findByRole('heading', { name: 'New invoice', level: 1 });
    expect(screen.getByLabelText('Invoice date')).toHaveValue('2025-12-31');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-01-30');
  });
});
