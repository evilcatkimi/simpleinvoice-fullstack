import { InMemoryLoginAttemptLimiter } from './in-memory-login-attempt-limiter';

describe('InMemoryLoginAttemptLimiter', () => {
  const NOW = new Date('2026-09-29T10:00:00.000Z');
  let limiter: InMemoryLoginAttemptLimiter;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    limiter = new InMemoryLoginAttemptLimiter({ maxFailedAttempts: 3, windowSeconds: 900 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function attempts(email: string, count: number): Promise<number[]> {
    const answers: number[] = [];
    for (let attempt = 0; attempt < count; attempt++) {
      answers.push(await limiter.registerAttempt(email));
    }
    return answers;
  }

  it('allows the configured number of attempts, then answers with the seconds left in the window', async () => {
    expect(await attempts('victim@example.com', 3)).toEqual([0, 0, 0]);

    jest.advanceTimersByTime(60_000);

    await expect(limiter.registerAttempt('victim@example.com')).resolves.toBe(840);
  });

  it('opens a fresh window once the previous one has ended', async () => {
    await attempts('victim@example.com', 4);

    jest.advanceTimersByTime(900_000);

    await expect(limiter.registerAttempt('victim@example.com')).resolves.toBe(0);
  });

  it('counts per account, whatever the letter case or surrounding spaces of the e-mail', async () => {
    await attempts('Victim@Example.com ', 3);

    await expect(limiter.registerAttempt('victim@example.com')).resolves.toBeGreaterThan(0);
    await expect(limiter.registerAttempt('someone.else@example.com')).resolves.toBe(0);
  });

  it('treats an unknown e-mail exactly like a registered one (no account enumeration)', async () => {
    expect(await attempts('nobody@example.com', 4)).toEqual([0, 0, 0, 900]);
  });

  it('does not let a successful login consume the budget: it clears the failed attempts', async () => {
    await attempts('reviewer@example.com', 2);

    await limiter.registerSuccess('reviewer@example.com');

    expect(await attempts('reviewer@example.com', 3)).toEqual([0, 0, 0]);
  });

  it('forgets ended windows of other accounts at the next sweep', async () => {
    await attempts('first@example.com', 4);
    jest.advanceTimersByTime(900_000);

    // Opening a window for another account sweeps the ended ones (at most once a minute).
    await limiter.registerAttempt('second@example.com');

    expect((limiter as unknown as { windows: Map<string, unknown> }).windows.size).toBe(1);
  });
});
