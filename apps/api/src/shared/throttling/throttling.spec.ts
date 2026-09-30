import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { buildThrottlerOptions, LoginThrottle } from './throttling';

class TestController {
  @LoginThrottle()
  login(): void {}

  list(): void {}
}

function contextFor(handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

describe('buildThrottlerOptions', () => {
  const options = buildThrottlerOptions({ limit: 5, ttlSeconds: 60 });
  const throttlers = (options as { throttlers: ThrottlerOptions[] }).throttlers;
  const login = throttlers.find((throttler) => throttler.name === 'login');

  it('defines a generous default limit and a strict login limit from configuration', () => {
    expect(throttlers).toEqual([
      expect.objectContaining({ name: 'default', limit: 300, ttl: 60_000 }),
      expect.objectContaining({ name: 'login', limit: 5, ttl: 60_000 }),
    ]);
  });

  it('only counts routes marked with @LoginThrottle() against the login limit', () => {
    expect(login?.skipIf?.(contextFor(TestController.prototype.login))).toBe(false);
    expect(login?.skipIf?.(contextFor(TestController.prototype.list))).toBe(true);
  });
});
