import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { minutes, seconds, type ThrottlerModuleOptions } from '@nestjs/throttler';

const DEFAULT_THROTTLER = 'default';
const LOGIN_THROTTLER = 'login';

/** Generous safety net for every route (per client IP). */
const DEFAULT_RATE_LIMIT = { limit: 300, ttl: minutes(1) };

const LOGIN_THROTTLED_KEY = 'throttling:login';

/**
 * Counts the route against the strict `login` throttler (credential-stuffing / brute-force protection) whose limit
 * and window come from THROTTLE_LOGIN_LIMIT / THROTTLE_LOGIN_TTL_SECONDS.
 */
export const LoginThrottle = () => SetMetadata(LOGIN_THROTTLED_KEY, true);

export interface LoginThrottleSettings {
  limit: number;
  ttlSeconds: number;
}

export function buildThrottlerOptions(login: LoginThrottleSettings): ThrottlerModuleOptions {
  const reflector = new Reflector();
  const isLoginRoute = (context: ExecutionContext) =>
    reflector.get<boolean | undefined>(LOGIN_THROTTLED_KEY, context.getHandler()) === true;

  return {
    errorMessage: 'Too many requests, please try again later',
    throttlers: [
      { name: DEFAULT_THROTTLER, ...DEFAULT_RATE_LIMIT },
      {
        name: LOGIN_THROTTLER,
        limit: login.limit,
        ttl: seconds(login.ttlSeconds),
        // Named throttlers apply to every route by default; this one only counts routes marked @LoginThrottle().
        skipIf: (context) => !isLoginRoute(context),
      },
    ],
  };
}
