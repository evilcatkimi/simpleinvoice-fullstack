import { createHash } from 'node:crypto';
import type { LoginAttemptLimiter } from '../application/login-attempt-limiter';

export interface LoginAttemptSettings {
  /** Failed logins allowed per account within one window (LOGIN_MAX_FAILED_ATTEMPTS). */
  maxFailedAttempts: number;
  /** LOGIN_FAILURE_WINDOW_SECONDS */
  windowSeconds: number;
}

interface AttemptWindow {
  attempts: number;
  /** Epoch milliseconds. */
  endsAt: number;
}

/** Ended windows are swept at most this often: memory stays bounded under a spray of distinct e-mail addresses. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Fixed windows per account: the first attempt opens a window of `windowSeconds`; once `maxFailedAttempts` attempts
 * were used in it, the account answers "try again later" until the window ends. Accounts are keyed by a SHA-256 of
 * the normalised e-mail, so no address is held in memory and unknown e-mails behave exactly like registered ones.
 */
export class InMemoryLoginAttemptLimiter implements LoginAttemptLimiter {
  private readonly windows = new Map<string, AttemptWindow>();
  private lastSweepAt = 0;

  constructor(private readonly settings: LoginAttemptSettings) {}

  registerAttempt(email: string): Promise<number> {
    const now = Date.now();
    const key = accountKey(email);
    let window = this.windows.get(key);
    if (window === undefined || window.endsAt <= now) {
      this.sweepEndedWindows(now);
      window = { attempts: 0, endsAt: now + this.settings.windowSeconds * 1000 };
      this.windows.set(key, window);
    }
    window.attempts += 1;
    const locked = window.attempts > this.settings.maxFailedAttempts;
    return Promise.resolve(locked ? Math.ceil((window.endsAt - now) / 1000) : 0);
  }

  registerSuccess(email: string): Promise<void> {
    this.windows.delete(accountKey(email));
    return Promise.resolve();
  }

  private sweepEndedWindows(now: number): void {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) {
      return;
    }
    this.lastSweepAt = now;
    for (const [key, window] of this.windows) {
      if (window.endsAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}

function accountKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('base64url');
}
