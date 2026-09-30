import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { ADMIN_USER_ID } from '../src/infrastructure/database/seeds/seed';
import type {
  LoginResponseDto,
  ProfileDto,
} from '../src/modules/auth/presentation/dto/auth-response.dto';
import type { ErrorResponseBody } from '../src/shared/filters/all-exceptions.filter';
import { TEST_ADMIN } from './setup/test-environment';
import { createInvoiceBody } from './utils/invoice-builders';
import {
  clearDatabase,
  createTestApp,
  http,
  login,
  resetDatabase,
  type Session,
} from './utils/test-app';

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('Authentication (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const errorOf = (body: unknown) => body as ErrorResponseBody;
  const SPA_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

  describe('POST /auth/login', () => {
    it('normalises the e-mail, returns a token and sets a hardened HttpOnly cookie', async () => {
      const response = await http(app)
        .post('/auth/login')
        .send({ email: '  E2E.Admin@Example.COM ', password: TEST_ADMIN.password })
        .expect(200);

      expect(response.body as LoginResponseDto).toEqual({
        accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/) as string,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: { id: ADMIN_USER_ID, email: TEST_ADMIN.email, fullname: 'Demo Reviewer' },
      });
      const [cookie] = response.get('Set-Cookie') ?? [];
      expect(cookie).toMatch(/^si_access_token=[\w.-]+;/);
      expect(cookie).toContain('Max-Age=3600');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).not.toContain('Secure'); // COOKIE_SECURE=false in tests (plain HTTP)
    });

    it('gives the same 401 for a wrong password and for an unknown e-mail', async () => {
      const wrongPassword = await http(app)
        .post('/auth/login')
        .send({ email: TEST_ADMIN.email, password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await http(app)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' })
        .expect(401);

      for (const response of [wrongPassword, unknownEmail]) {
        expect(errorOf(response.body)).toMatchObject({
          statusCode: 401,
          message: 'Invalid email or password',
          error: 'Unauthorized',
        });
        expect(response.get('Set-Cookie')).toBeUndefined();
      }
    });

    it.each([
      [{ email: 'not-an-email', password: 'x' }, 'email must be an email'],
      [{ email: TEST_ADMIN.email, password: '' }, 'password must be between 1 and 72 bytes long'],
      [
        { email: TEST_ADMIN.email, password: 'é'.repeat(37) },
        'password must be between 1 and 72 bytes long',
      ],
      [
        { email: TEST_ADMIN.email, password: 'x', remember: true },
        'property remember should not exist',
      ],
      [
        { email: TEST_ADMIN.email, password: `${TEST_ADMIN.password}\u0000anything` },
        'password must not contain NUL characters',
      ],
    ])('validates the body %p', async (body, message) => {
      const response = await http(app).post('/auth/login').send(body).expect(400);

      expect(errorOf(response.body).message).toContain(message);
    });

    it.each([
      [
        'an HTML form (login CSRF)',
        'application/x-www-form-urlencoded',
        new URLSearchParams(TEST_ADMIN).toString(),
      ],
      ['a text/plain form', 'text/plain', JSON.stringify(TEST_ADMIN)],
    ])(
      'refuses valid credentials sent as %s with 415 and sets no cookie',
      async (_case, contentType, body) => {
        const response = await http(app)
          .post('/auth/login')
          .set('Content-Type', contentType)
          .set('Origin', 'https://evil.example')
          .send(body)
          .expect(415);

        expect(errorOf(response.body)).toMatchObject({
          statusCode: 415,
          message: 'Content-Type must be application/json',
          error: 'Unsupported Media Type',
        });
        expect(response.get('Set-Cookie')).toBeUndefined();
      },
    );
  });

  describe('protected routes', () => {
    let session: Session;

    beforeAll(async () => {
      session = await login(app);
    });

    it('GET /auth/me returns the profile for a Bearer token', async () => {
      const response = await http(app).get('/auth/me').set(session.bearer).expect(200);

      expect(response.body as ProfileDto).toEqual({
        id: ADMIN_USER_ID,
        email: TEST_ADMIN.email,
        fullname: 'Demo Reviewer',
        createdAt: expect.any(String) as string,
      });
    });

    it('GET /auth/me accepts the HttpOnly cookie (the SPA never handles the token)', async () => {
      await http(app).get('/auth/me').set('Cookie', session.cookie).expect(200);
    });

    it('rejects requests without a token in the standard error shape', async () => {
      const response = await http(app).get('/invoices').expect(401);

      expect(errorOf(response.body)).toEqual({
        statusCode: 401,
        message: 'Authentication required',
        error: 'Unauthorized',
        path: '/invoices',
        timestamp: expect.any(String) as string,
        requestId: response.headers['x-request-id'],
      });
    });

    it('rejects a token whose payload was tampered with', async () => {
      const [header, payload, signature] = session.accessToken.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as object;
      const forged = [
        header,
        base64url({ ...claims, email: 'attacker@example.com' }),
        signature,
      ].join('.');

      await http(app).get('/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('rejects an unsigned "alg: none" token', async () => {
      const [, payload] = session.accessToken.split('.');
      const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${payload}.`;

      await http(app).get('/auth/me').set('Authorization', `Bearer ${unsigned}`).expect(401);
    });

    it.each([
      [
        'without a token id (issued before revocation existed)',
        { sub: ADMIN_USER_ID, email: TEST_ADMIN.email },
      ],
      [
        'whose sub is not a UUID (it used to reach the users query: 500)',
        { sub: "x' OR '1'='1", email: TEST_ADMIN.email, jti: randomUUID() },
      ],
    ])('answers 401 to a correctly signed token %s', async (_case, claims) => {
      const token = await app.get(JwtService).signAsync(claims);

      const response = await http(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(errorOf(response.body).message).toBe('Invalid or expired access token');
    });

    describe('CSRF protection for cookie authentication', () => {
      it('refuses a cookie-authenticated POST without X-Requested-With', async () => {
        const response = await http(app)
          .post('/invoices')
          .set('Cookie', session.cookie)
          .send(createInvoiceBody())
          .expect(403);

        expect(errorOf(response.body)).toMatchObject({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Missing X-Requested-With: XMLHttpRequest header',
        });
      });

      it('accepts the same POST when the SPA header is present', async () => {
        await http(app)
          .post('/invoices')
          .set('Cookie', session.cookie)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send(createInvoiceBody())
          .expect(201);
      });

      it('does not apply to Bearer clients such as Swagger or curl', async () => {
        await http(app).post('/invoices').set(session.bearer).send(createInvoiceBody()).expect(201);
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the cookie and is idempotent without a session', async () => {
      const response = await http(app).post('/auth/logout').set(SPA_HEADER).expect(204);

      const [cookie] = response.get('Set-Cookie') ?? [];
      expect(cookie).toMatch(/^si_access_token=;/);
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('refuses a logout without X-Requested-With: a cross-site form could otherwise end the session', async () => {
      const session = await login(app);

      const response = await http(app)
        .post('/auth/logout')
        .set('Cookie', session.cookie)
        .expect(403);

      expect(errorOf(response.body).message).toBe(
        'Missing X-Requested-With: XMLHttpRequest header',
      );
      expect(response.get('Set-Cookie')).toBeUndefined();
      await http(app).get('/auth/me').set('Cookie', session.cookie).expect(200);
    });

    it.each([
      ['the SPA (cookie)', (session: Session) => ({ Cookie: session.cookie })],
      ['an API client (Bearer header)', (session: Session) => session.bearer],
    ])('revokes the token of %s: a copy of it no longer works', async (_client, credentials) => {
      const session = await login(app);
      await http(app).get('/auth/me').set(session.bearer).expect(200);

      await http(app).post('/auth/logout').set(credentials(session)).set(SPA_HEADER).expect(204);

      for (const reused of [{ Cookie: session.cookie }, session.bearer]) {
        const response = await http(app).get('/invoices').set(reused).expect(401);
        expect(errorOf(response.body).message).toBe('Invalid or expired access token');
      }
    });

    it('leaves the other sessions of the same user alone', async () => {
      const [ended, other] = [await login(app), await login(app)];

      await http(app).post('/auth/logout').set(ended.bearer).set(SPA_HEADER).expect(204);

      await http(app).get('/auth/me').set(other.bearer).expect(200);
    });
  });

  describe('with COOKIE_SECURE=true (served over HTTPS)', () => {
    let secureApp: NestExpressApplication;

    beforeAll(async () => {
      secureApp = await createTestApp({ env: { COOKIE_SECURE: true } });
    });

    afterAll(async () => {
      await secureApp.close();
    });

    it('names the cookie __Host-si_access_token: Secure, Path=/ and no Domain, so nothing can overwrite it', async () => {
      const response = await http(secureApp).post('/auth/login').send(TEST_ADMIN).expect(200);

      const [cookie] = response.get('Set-Cookie') ?? [];
      expect(cookie).toMatch(/^__Host-si_access_token=[\w.-]+;/);
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toMatch(/Domain=/i);

      const sessionCookie = cookie.split(';')[0];
      await http(secureApp).get('/auth/me').set('Cookie', sessionCookie).expect(200);
      // The unprefixed name, which a subdomain or plain-HTTP response could set, is not read.
      await http(secureApp)
        .get('/auth/me')
        .set('Cookie', sessionCookie.replace('__Host-', ''))
        .expect(401);
    });

    it('clears the prefixed cookie on logout', async () => {
      const response = await http(secureApp).post('/auth/logout').set(SPA_HEADER).expect(204);

      expect(response.get('Set-Cookie')?.[0]).toMatch(/^__Host-si_access_token=;.*Secure/);
    });
  });

  describe('deleted accounts', () => {
    afterAll(async () => {
      await resetDatabase(app);
    });

    it('rejects a still-valid token once the user no longer exists', async () => {
      const session = await login(app);
      await clearDatabase(app);

      const response = await http(app).get('/auth/me').set(session.bearer).expect(401);

      expect(errorOf(response.body).message).toBe('User no longer exists');
    });

    it("answers 401, not 500, when a deleted user's still-valid token creates an invoice", async () => {
      await resetDatabase(app);
      const session = await login(app);
      await clearDatabase(app);

      const response = await http(app)
        .post('/invoices')
        .set(session.bearer)
        .send(createInvoiceBody())
        .expect(401);

      expect(errorOf(response.body).message).toBe('User no longer exists');
    });
  });
});
