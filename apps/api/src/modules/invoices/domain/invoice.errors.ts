import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
} from '../../../shared/errors/application-errors';

export class InvoiceNotFoundError extends NotFoundError {
  constructor() {
    super('Invoice not found');
  }
}

/** Invoice numbers are unique regardless of letter case; the database constraints are what detect the clash. */
export class DuplicateInvoiceNumberError extends ConflictError {
  constructor() {
    super('Invoice number already exists');
  }
}

/** The authenticated user was deleted after the access token was issued: the token no longer identifies anyone. */
export class InvoiceCreatorNotFoundError extends UnauthenticatedError {
  constructor() {
    super('User no longer exists');
  }
}
