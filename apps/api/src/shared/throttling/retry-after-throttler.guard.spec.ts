import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { RetryAfterThrottlerGuard } from './retry-after-throttler.guard';
import { buildThrottlerOptions, LoginThrottle } from './throttling';

class TestController {
  @LoginThrottle()
  login(): void {}
}

describe('RetryAfterThrottlerGuard', () => {
  const storage = new ThrottlerStorageService();

  afterAll(() => {
    storage.onApplicationShutdown();
  });

  it('adds the standard Retry-After to a 429 from the named login throttler', async () => {
    const guard = new RetryAfterThrottlerGuard(
      buildThrottlerOptions({ limit: 1, ttlSeconds: 60 }),
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
    const headers = new Map<string, unknown>();
    const context = {
      getHandler: () => TestController.prototype.login,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({ ip: '203.0.113.7', headers: {} }),
        getResponse: () => ({ header: (name: string, value: unknown) => headers.set(name, value) }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toThrow(ThrottlerException);

    expect(headers.get('Retry-After-login')).toBe(60);
    expect(headers.get('Retry-After')).toBe(60);
  });
});
