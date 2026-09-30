/**
 * Port: brute-force protection per account, whatever the client IP (the per-IP limit is the throttler's job).
 * Only failed logins use up the budget: an attempt is counted before the password is checked, so concurrent guesses
 * cannot overshoot the limit, and a successful login clears the count. The adapter is in-memory (per process); several
 * API instances need a shared store behind the same port.
 */
export abstract class LoginAttemptLimiter {
  /**
   * Counts a login attempt on `email`. Resolves to 0 when it may proceed, otherwise to the number of seconds until
   * the account accepts attempts again.
   */
  abstract registerAttempt(email: string): Promise<number>;

  /** The password was right: forget the account's failed attempts. */
  abstract registerSuccess(email: string): Promise<void>;
}
