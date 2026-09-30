import { buildMessage, ValidateBy, type ValidationOptions } from 'class-validator';
import { isCalendarDate } from '../dates/calendar-date';

/** Strict `YYYY-MM-DD` that is also a real date: "2026-02-30" and "2026-2-3" are rejected. */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCalendarDate',
      validator: {
        validate: (value) => isCalendarDate(value),
        defaultMessage: buildMessage(
          (each) => `${each}$property must be a valid date in YYYY-MM-DD format`,
          options,
        ),
      },
    },
    options,
  );
}

/**
 * The decorated date must be on or after the date held by `property` of the same object,
 * e.g. `@IsOnOrAfter('invoiceDate') dueDate` → "dueDate must be on or after invoiceDate".
 */
export function IsOnOrAfter(property: string, options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isOnOrAfter',
      constraints: [property],
      validator: {
        validate: (value, args) => {
          const other = (args?.object as Record<string, unknown> | undefined)?.[property];
          // Malformed or missing dates are reported by @IsCalendarDate on each field; only compare two valid dates.
          if (!isCalendarDate(value) || !isCalendarDate(other)) {
            return true;
          }
          return value >= other;
        },
        defaultMessage: buildMessage(
          (each) => `${each}$property must be on or after $constraint1`,
          options,
        ),
      },
    },
    options,
  );
}
