import type { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/environment';
import { deriveInvoiceStatus } from '../../modules/invoices/domain/invoice-status';
import { SystemClock } from './clock';

function clockIn(timeZone: string) {
  const config = { get: jest.fn(() => timeZone) };
  const clock = new SystemClock(config as unknown as ConfigService<AppEnvironment, true>);
  return { clock, config };
}

/** Freezes the system time at an instant (ISO-8601 with an explicit offset). */
function at(instant: string): void {
  jest.setSystemTime(new Date(instant));
}

describe('SystemClock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads the application time zone from APP_TIMEZONE', () => {
    const { config } = clockIn('Asia/Ho_Chi_Minh');

    expect(config.get).toHaveBeenCalledWith('APP_TIMEZONE', { infer: true });
  });

  it.each([
    ['UTC', '2026-09-29T23:59:59.999Z', '2026-09-29'],
    ['UTC', '2026-09-30T00:00:00.000Z', '2026-09-30'],
    ['Asia/Ho_Chi_Minh', '2026-09-29T23:59:59.999+07:00', '2026-09-29'],
    ['Asia/Ho_Chi_Minh', '2026-09-30T00:00:00.000+07:00', '2026-09-30'],
    ['America/Los_Angeles', '2026-09-29T23:59:59.999-07:00', '2026-09-29'],
    ['America/Los_Angeles', '2026-09-30T00:00:00.000-07:00', '2026-09-30'],
  ])('in %s at %s, today is %s', (timeZone, instant, today) => {
    const { clock } = clockIn(timeZone);
    at(instant);

    expect(clock.today()).toBe(today);
  });

  it('follows daylight-saving changes (Sydney moves from UTC+10 to UTC+11 on 4 October 2026)', () => {
    const { clock } = clockIn('Australia/Sydney');

    at('2026-10-04T23:59:59.999+11:00');
    expect(clock.today()).toBe('2026-10-04');

    // A fixed +10 offset would still say 4 October here.
    at('2026-10-05T00:00:00.000+11:00');
    expect(clock.today()).toBe('2026-10-05');
  });

  it('makes an invoice Overdue at local midnight in APP_TIMEZONE, not at UTC midnight', () => {
    const { clock } = clockIn('Asia/Ho_Chi_Minh');
    const dueDate = '2026-09-29';

    at('2026-09-29T23:59:59.999+07:00');
    expect(deriveInvoiceStatus('Pending', dueDate, clock.today())).toBe('Pending');

    // 00:00 on 30 September in Ho Chi Minh City is still 29 September in UTC.
    at('2026-09-30T00:00:00.000+07:00');
    expect(deriveInvoiceStatus('Pending', dueDate, clock.today())).toBe('Overdue');
  });
});
