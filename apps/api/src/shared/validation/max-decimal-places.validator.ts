import { buildMessage, ValidateBy, type ValidationOptions } from 'class-validator';
import Decimal from 'decimal.js';

/**
 * A finite number with at most `max` decimal places (money has cents, not fractions of cents).
 * decimal.js reads the number's shortest round-trip form, so 0.1 has 1 place and 1e-7 has 7. class-validator's
 * `IsNumber({ maxDecimalPlaces })` is not used because it splits `toString()` on "." and throws on 1e-7.
 */
export function MaxDecimalPlaces(max: number, options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxDecimalPlaces',
      constraints: [max],
      validator: {
        validate: (value) =>
          typeof value === 'number' &&
          Number.isFinite(value) &&
          new Decimal(value).decimalPlaces() <= max,
        defaultMessage: buildMessage(
          (each) => `${each}$property must have at most $constraint1 decimal places`,
          options,
        ),
      },
    },
    options,
  );
}
