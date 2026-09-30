/**
 * SQLSTATE, the SQL standard's five-character error codes: PostgreSQL reports one with every failed statement, and
 * TypeORM's QueryFailedError copies the driver error's fields, `code` included, onto itself. Pure helpers, so that the
 * exception filter and the log serializer depend on the standard code only, not on a database library.
 */

/** Class 22, "data exception": NUL bytes in text, malformed uuid/number/date text, values out of range, … */
const DATA_EXCEPTION_CLASS = '22';

/** For already-serialized errors too (log serializer): only the SQLSTATE `code` is looked at. */
export function isDataExceptionCode(code: unknown): boolean {
  return typeof code === 'string' && code.length === 5 && code.startsWith(DATA_EXCEPTION_CLASS);
}

/** The database rejected a value as malformed: bad client input that validation should have caught first. */
export function isDataException(error: unknown): boolean {
  return error instanceof Error && isDataExceptionCode((error as { code?: unknown }).code);
}
