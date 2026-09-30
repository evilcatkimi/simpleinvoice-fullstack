import { QueryFailedError } from 'typeorm';

/** SQLSTATE raised by PostgreSQL when a UNIQUE constraint or unique index is violated. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

interface DriverErrorFields {
  code?: unknown;
  constraint?: unknown;
}

function driverErrorOf(error: unknown): DriverErrorFields | undefined {
  return error instanceof QueryFailedError
    ? (error.driverError as DriverErrorFields | undefined)
    : undefined;
}

/**
 * True when `error` is a unique violation of the named constraint or unique index. Uniqueness is decided by the
 * database (not by a SELECT before the INSERT), which is the only race-free way: two concurrent requests cannot both
 * pass the check.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const driverError = driverErrorOf(error);
  return driverError?.code === PG_UNIQUE_VIOLATION && driverError.constraint === constraint;
}

export function isForeignKeyViolation(error: unknown, constraint: string): boolean {
  const driverError = driverErrorOf(error);
  return driverError?.code === PG_FOREIGN_KEY_VIOLATION && driverError.constraint === constraint;
}
