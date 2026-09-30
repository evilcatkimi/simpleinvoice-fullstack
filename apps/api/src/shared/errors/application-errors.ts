/**
 * Errors raised by the domain and application layers. They carry no HTTP concepts: the global exception filter maps
 * each kind to a status code, so business code stays independent of the transport.
 */
export type ApplicationErrorKind =
  'business-rule' | 'unauthenticated' | 'not-found' | 'conflict' | 'rate-limited';

export abstract class ApplicationError extends Error {
  abstract readonly kind: ApplicationErrorKind;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Well-formed input that breaks a business rule (e.g. a discount larger than the total). */
export class BusinessRuleViolationError extends ApplicationError {
  override readonly kind = 'business-rule';
}

export class UnauthenticatedError extends ApplicationError {
  override readonly kind = 'unauthenticated';
}

export class NotFoundError extends ApplicationError {
  override readonly kind = 'not-found';
}

/** The request conflicts with the current state (e.g. a unique value already taken). */
export class ConflictError extends ApplicationError {
  override readonly kind = 'conflict';
}

/** Too many attempts in a short time; the caller may try again after `retryAfterSeconds`. */
export class RateLimitedError extends ApplicationError {
  override readonly kind = 'rate-limited';

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}
