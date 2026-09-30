import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getOptionsToken, seconds } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import { ADMIN_USER_ID } from '../src/infrastructure/database/seeds/seed';
import type { ErrorResponseBody } from '../src/shared/filters/all-exceptions.filter';
import { buildThrottlerOptions } from '../src/shared/throttling/throttling';
import { TEST_ADMIN } from './setup/test-environment';
import { createTestApp, http, resetDatabase, type TestAppOptions } from './utils/test-app';

const LOGIN_LIMIT = 3;

/** Same options factory as production, with a low per-IP login limit so the tests stay fast. */
const lowLoginLimit: TestAppOptions['customize'] = (builder) =>
  builder
    .overrideProvider(getOptionsToken())
    .useValue(buildThrottlerOptions({ limit: LOGIN_LIMIT, ttlSeconds: 60 }));

describe('Login rate limiting (e2e)', () => {
  const attemptLogin = (app: NestExpressApplication, password: string) =>
    http(app).post('/auth/login').send({ email: TEST_ADMIN.email, password });

  describe('per client IP', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp({ customize: lowLoginLimit });
      await resetDatabase(app);
    });

    afterAll(async () => {
      await app.close();
    });

    it('answers 429 once a client exceeds the login limit, even with the right password', async () => {
      for (let attempt = 0; attempt < LOGIN_LIMIT; attempt++) {
        await attemptLogin(app, 'wrong-password').expect(401);
      }

      const blocked = await attemptLogin(app, TEST_ADMIN.password).expect(429);

      expect(blocked.body as ErrorResponseBody).toMatchObject({
        statusCode: 429,
        message: 'Too many requests, please try again later',
        error: 'Too Many Requests',
      });
      // The throttler's own header, and the standard one clients read: seconds until a request is allowed again.
      expect(blocked.headers['retry-after-login']).toBe(blocked.headers['retry-after']);
      const retryAfter = Number(blocked.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it('ignores X-Forwarded-For when no proxy is trusted, so the limit cannot be dodged', async () => {
      await attemptLogin(app, TEST_ADMIN.password)
        .set('X-Forwarded-For', '203.0.113.7')
        .expect(429);
    });

    it('does not count other routes against the login limit', async () => {
      const token = await app
        .get(JwtService)
        .signAsync({ sub: ADMIN_USER_ID, email: TEST_ADMIN.email, jti: randomUUID() });

      for (let request = 0; request < LOGIN_LIMIT + 2; request++) {
        await http(app).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
        await http(app).get('/health').expect(200);
      }
    });
  });

  describe('default limit on every route', () => {
    it('answers 429 with Retry-After once a client exceeds it', async () => {
      const app = await createTestApp({
        customize: (builder) =>
          builder
            .overrideProvider(getOptionsToken())
            .useValue({ throttlers: [{ name: 'default', limit: 2, ttl: seconds(60) }] }),
      });
      try {
        await http(app).get('/health').expect(200);
        await http(app).get('/health').expect(200);

        const blocked = await http(app).get('/health').expect(429);

        const retryAfter = Number(blocked.headers['retry-after']);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);
      } finally {
        await app.close();
      }
    });
  });

  // Supertest connects from loopback, so the test client plays the peer under test: a client reaching the API port
  // directly (untrusted), or the nginx container (the trusted proxy). TRUST_PROXY goes through the real
  // configuration → configureApp → Express path.
  describe('client IP behind the reverse proxy (TRUST_PROXY)', () => {
    const remainingLogins = (response: Response) =>
      response.headers['x-ratelimit-remaining-login'] as string | undefined;

    async function loginsForwardedFor(trustProxy: string[], forwardedFor: string[]) {
      const app = await createTestApp({
        env: { TRUST_PROXY: trustProxy },
        customize: lowLoginLimit,
      });
      try {
        await resetDatabase(app);
        const responses: Response[] = [];
        for (const value of forwardedFor) {
          responses.push(await attemptLogin(app, 'wrong-password').set('X-Forwarded-For', value));
        }
        return responses;
      } finally {
        await app.close();
      }
    }

    it('ignores X-Forwarded-For from a peer that is not the proxy: rotating spoofed IPs share one bucket', async () => {
      const responses = await loginsForwardedFor(
        ['10.203.47.10'],
        ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4'],
      );

      expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 429]);
      expect(responses.slice(0, 3).map(remainingLogins)).toEqual(['2', '1', '0']);
    });

    it('uses the address the trusted proxy appended: one bucket per real client, whatever the client prepends', async () => {
      const responses = await loginsForwardedFor(
        ['127.0.0.1'],
        ['198.51.100.9, 203.0.113.50', '198.51.100.10, 203.0.113.50', '203.0.113.51'],
      );

      expect(responses.map(remainingLogins)).toEqual(['2', '1', '2']);
    });
  });

  describe('per account: failed logins, whatever the client IP', () => {
    const MAX_FAILED_ATTEMPTS = 3;
    let app: NestExpressApplication;
    let clientNumber = 0;

    /** Each attempt from a new client IP (forwarded by the trusted proxy): only the per-account limit can apply. */
    const loginAs = (email: string, password: string) =>
      http(app)
        .post('/auth/login')
        .set('X-Forwarded-For', `203.0.113.${++clientNumber}`)
        .send({ email, password });

    beforeEach(async () => {
      app = await createTestApp({
        env: { LOGIN_MAX_FAILED_ATTEMPTS: MAX_FAILED_ATTEMPTS, TRUST_PROXY: ['127.0.0.1'] },
      });
      await resetDatabase(app);
    });

    afterEach(async () => {
      await app.close();
    });

    it('locks the account once its failures are used up, even for the right password, and says when to retry', async () => {
      for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
        await loginAs(TEST_ADMIN.email, 'wrong-password').expect(401);
      }

      const blocked = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password).expect(429);

      expect(blocked.body as ErrorResponseBody).toMatchObject({
        statusCode: 429,
        message: 'Too many attempts, try again later',
        error: 'Too Many Requests',
      });
      const retryAfter = Number(blocked.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(900);
      expect(blocked.get('Set-Cookie')).toBeUndefined();
    });

    it('answers an unknown e-mail exactly the same way (no account enumeration)', async () => {
      for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
        await loginAs('nobody@example.com', 'wrong-password').expect(401);
      }

      await loginAs('nobody@example.com', 'wrong-password').expect(429);
      // Other accounts are unaffected.
      await loginAs(TEST_ADMIN.email, TEST_ADMIN.password).expect(200);
    });

    it('does not count successful logins, and a success clears the failures', async () => {
      await loginAs(TEST_ADMIN.email, 'wrong-password').expect(401);
      await loginAs(TEST_ADMIN.email, 'wrong-password').expect(401);
      await loginAs(TEST_ADMIN.email, TEST_ADMIN.password).expect(200);

      for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
        await loginAs(TEST_ADMIN.email, 'wrong-password').expect(401);
      }
      await loginAs(TEST_ADMIN.email, 'wrong-password').expect(429);
    });
  });
});
