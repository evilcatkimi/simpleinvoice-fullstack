import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsCalendarDate, IsOnOrAfter } from './date.validators';
import { MaxDecimalPlaces } from './max-decimal-places.validator';

class Period {
  @IsCalendarDate()
  invoiceDate: string;

  @IsCalendarDate()
  @IsOnOrAfter('invoiceDate')
  dueDate: string;
}

class Price {
  @MaxDecimalPlaces(2)
  amount: unknown;
}

function messages<T extends object>(type: new () => T, plain: object): string[] {
  return validateSync(plainToInstance(type, plain)).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
}

describe('IsOnOrAfter', () => {
  it('accepts a due date after the invoice date', () => {
    expect(messages(Period, { invoiceDate: '2026-09-29', dueDate: '2026-10-29' })).toEqual([]);
  });

  it('accepts a due date equal to the invoice date', () => {
    expect(messages(Period, { invoiceDate: '2026-09-29', dueDate: '2026-09-29' })).toEqual([]);
  });

  it('rejects a due date before the invoice date with the contract message', () => {
    expect(messages(Period, { invoiceDate: '2026-09-29', dueDate: '2026-09-28' })).toEqual([
      'dueDate must be on or after invoiceDate',
    ]);
  });

  it('compares across year boundaries', () => {
    expect(messages(Period, { invoiceDate: '2026-12-31', dueDate: '2027-01-01' })).toEqual([]);
    expect(messages(Period, { invoiceDate: '2027-01-01', dueDate: '2026-12-31' })).toEqual([
      'dueDate must be on or after invoiceDate',
    ]);
  });

  it('leaves malformed dates to IsCalendarDate instead of comparing them', () => {
    expect(messages(Period, { invoiceDate: '2026-02-30', dueDate: '2026-01-01' })).toEqual([
      'invoiceDate must be a valid date in YYYY-MM-DD format',
    ]);
  });
});

describe('IsCalendarDate', () => {
  it('rejects impossible and non-ISO dates', () => {
    expect(messages(Period, { invoiceDate: '2026-02-30', dueDate: '30/09/2026' })).toEqual([
      'invoiceDate must be a valid date in YYYY-MM-DD format',
      'dueDate must be a valid date in YYYY-MM-DD format',
    ]);
  });
});

describe('MaxDecimalPlaces', () => {
  it.each([150, 150.5, 150.55, 0.01, 1_000_000_000])('accepts %p', (amount) => {
    expect(messages(Price, { amount })).toEqual([]);
  });

  it.each([150.555, 0.001, 1e-7, 0.1 + 0.2, Number.NaN, Number.POSITIVE_INFINITY, '1.5', null])(
    'rejects %p',
    (amount) => {
      expect(messages(Price, { amount })).toEqual(['amount must have at most 2 decimal places']);
    },
  );
});
