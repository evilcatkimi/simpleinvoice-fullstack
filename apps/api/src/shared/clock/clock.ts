import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/environment';
import { toCalendarDate } from '../dates/calendar-date';

/**
 * Source of "today" for business rules. Injected (never `new Date()` inline) so tests can freeze time and so the
 * whole request uses one consistent date.
 */
export abstract class Clock {
  /** Current calendar date (`YYYY-MM-DD`) in the application time zone. */
  abstract today(): string;
}

@Injectable()
export class SystemClock extends Clock {
  private readonly timeZone: string;

  constructor(config: ConfigService<AppEnvironment, true>) {
    super();
    this.timeZone = config.get('APP_TIMEZONE', { infer: true });
  }

  today(): string {
    return toCalendarDate(new Date(), this.timeZone);
  }
}
