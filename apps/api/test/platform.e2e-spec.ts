import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { DOCUMENTED_DEMO_PASSWORD } from '../src/infrastructure/database/seeds/demo-credentials';
import type { CurrencyDto } from '../src/modules/currencies/presentation/currency.dto';
import type { ErrorResponseBody } from '../src/shared/filters/all-exceptions.filter';
import { TEST_ADMIN } from './setup/test-environment';
import { createTestApp, http, login, resetDatabase, type Session } from './utils/test-app';

interface OpenApiOperation {
  parameters?: { name: string; in: string }[];
  responses: Record<
    string,
    { description: string; headers?: Record<string, unknown>; content?: Record<string, unknown> }
  >;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, { properties: Record<string, { example?: unknown }> }>;
  };
}

describe('Platform: health, currencies, docs and HTTP hardening (e2e)', () => {
  let app: NestExpressApplication;
  let session: Session;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    session = await login(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('is public and reports the database as up', async () => {
      const response = await http(app).get('/health').expect(200);

      expect(response.body).toEqual({ status: 'ok', db: 'up' });
    });

    it('is counted against the default per-IP limit (each call runs a query)', async () => {
      const response = await http(app).get('/health').expect(200);

      expect(response.headers['x-ratelimit-limit']).toBe('300');
      expect(Number(response.headers['x-ratelimit-remaining'])).toBeLessThan(300);
    });

    it('answers 503 when the database cannot be reached', async () => {
      const query = jest
        .spyOn(app.get(DataSource), 'query')
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      const response = await http(app).get('/health').expect(503);

      expect(response.body as ErrorResponseBody).toMatchObject({
        statusCode: 503,
        message: 'Database unavailable',
        error: 'Service Unavailable',
      });
      query.mockRestore();
    });
  });

  describe('GET /currencies', () => {
    it('requires authentication', async () => {
      await http(app).get('/currencies').expect(401);
    });

    it('lists the supported currencies with their symbols', async () => {
      const response = await http(app).get('/currencies').set(session.bearer).expect(200);
      const currencies = response.body as CurrencyDto[];

      expect(currencies.map((currency) => currency.code)).toEqual([
        'AUD',
        'USD',
        'GBP',
        'EUR',
        'SGD',
        'NZD',
        'CAD',
        'VND',
      ]);
      expect(currencies[0]).toEqual({ code: 'AUD', symbol: 'AU$', name: 'Australian Dollar' });
    });
  });

  describe('API documentation', () => {
    it('serves Swagger UI at /api/docs', async () => {
      const response = await http(app).get('/api/docs').expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['content-security-policy']).not.toContain(
        'upgrade-insecure-requests',
      );
    });

    it('publishes an OpenAPI document covering every endpoint and both auth schemes', async () => {
      const response = await http(app).get('/api/docs-json').expect(200);
      const document = response.body as OpenApiDocument;

      expect(Object.keys(document.paths).sort()).toEqual(
        [
          '/auth/login',
          '/auth/logout',
          '/auth/me',
          '/currencies',
          '/health',
          '/invoices',
          '/invoices/{id}',
        ].sort(),
      );
      expect(Object.keys(document.components.securitySchemes).sort()).toEqual(['bearer', 'cookie']);
    });

    it('publishes no credentials: no password example that would pre-fill a working login', async () => {
      const response = await http(app).get('/api/docs-json').expect(200);
      const document = response.body as OpenApiDocument;

      expect(document.components.schemas.LoginDto.properties.password.example).toBeUndefined();
      expect(document.components.schemas.LoginDto.properties.email.example).toBe(
        'user@example.com',
      );
      expect(response.text).not.toContain(DOCUMENTED_DEMO_PASSWORD);
      expect(response.text).not.toContain(TEST_ADMIN.password);
    });

    it('documents 429 with Retry-After on every operation: every route is rate-limited', async () => {
      const document = (await http(app).get('/api/docs-json').expect(200)).body as OpenApiDocument;

      const undocumented = Object.entries(document.paths).flatMap(([path, operations]) =>
        Object.entries(operations)
          .filter(([, operation]) => !operation.responses['429']?.headers?.['Retry-After'])
          .map(([method]) => `${method.toUpperCase()} ${path}`),
      );
      expect(undocumented).toEqual([]);
      expect(document.paths['/health'].get.responses['429'].content).toEqual({
        'application/json': { schema: { $ref: '#/components/schemas/ErrorResponseDto' } },
      });
      // Login keeps its own description: it also has the per-IP login and per-account limits.
      expect(document.paths['/auth/login'].post.responses['429'].description).toContain(
        'per account',
      );
    });

    it('documents the header logout requires', async () => {
      const document = (await http(app).get('/api/docs-json').expect(200)).body as OpenApiDocument;

      expect(document.paths['/auth/logout'].post.parameters).toEqual([
        expect.objectContaining({ name: 'X-Requested-With', in: 'header', required: true }),
      ]);
    });
  });

  describe('Cache-Control', () => {
    it.each([
      [
        'POST /auth/login (token in the body)',
        () => http(app).post('/auth/login').send(TEST_ADMIN),
        200,
      ],
      [
        'POST /auth/login rejected',
        () =>
          http(app)
            .post('/auth/login')
            .send({ ...TEST_ADMIN, password: 'x' }),
        401,
      ],
      ['GET /auth/me', () => http(app).get('/auth/me').set(session.bearer), 200],
      ['GET /invoices', () => http(app).get('/invoices').set(session.bearer), 200],
      ['GET /invoices without a token', () => http(app).get('/invoices'), 401],
      [
        'GET /invoices/:id not found',
        () => http(app).get('/invoices/00000000-0000-4000-8000-000000000000').set(session.bearer),
        404,
      ],
      [
        'POST /invoices invalid',
        () => http(app).post('/invoices').set(session.bearer).send({}),
        400,
      ],
    ])('forbids storing %s in any cache', async (_request, send, status) => {
      const response = await send().expect(status);

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('leaves the static Swagger UI cacheable', async () => {
      const response = await http(app).get('/api/docs').expect(200);

      expect(response.headers['cache-control']).not.toBe('no-store');
    });
  });

  describe('request bodies', () => {
    it('accepts JSON only: other content types get 415 in the standard error shape', async () => {
      const response = await http(app)
        .post('/invoices')
        .set(session.bearer)
        .set('Content-Type', 'text/plain')
        .send('{"invoiceNumber":"TEXT-1"}')
        .expect(415);

      expect(response.body as ErrorResponseBody).toMatchObject({
        statusCode: 415,
        message: 'Content-Type must be application/json',
        error: 'Unsupported Media Type',
        path: '/invoices',
      });
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('answers 400, not 500, to 40,000 nested brackets (80 kB, unauthenticated)', async () => {
      const response = await http(app)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send(`${'['.repeat(40_000)}${']'.repeat(40_000)}`)
        .expect(400);

      expect(response.body as ErrorResponseBody).toMatchObject({
        statusCode: 400,
        message: 'Request body is nested too deeply',
      });
    });
  });

  describe('HTTP conventions', () => {
    it('answers unknown routes with 404 in the standard error shape', async () => {
      const response = await http(app).get('/does-not-exist').set(session.bearer).expect(404);

      expect(response.body as ErrorResponseBody).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
        path: '/does-not-exist',
      });
    });

    it('echoes a well-formed X-Request-Id and replaces an unsafe one', async () => {
      const echoed = await http(app)
        .get('/health')
        .set('X-Request-Id', 'trace-abc-123')
        .expect(200);
      expect(echoed.headers['x-request-id']).toBe('trace-abc-123');

      for (const unsafe of ['id with spaces', '<script>', 'x'.repeat(65)]) {
        const replaced = await http(app).get('/health').set('X-Request-Id', unsafe).expect(200);
        expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      }
    });

    it('sets security headers and hides the framework', async () => {
      const response = await http(app).get('/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('grants no cross-origin access by default: the SPA is same-origin behind the proxy', async () => {
      for (const origin of ['http://localhost:5173', 'http://localhost:3000']) {
        const preflight = await http(app)
          .options('/invoices')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'POST');
        const credentialed = await http(app)
          .get('/auth/me')
          .set('Origin', origin)
          .set(session.bearer)
          .expect(200);

        expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
        expect(credentialed.headers['access-control-allow-origin']).toBeUndefined();
        expect(credentialed.headers['access-control-allow-credentials']).toBeUndefined();
      }
    });

    describe('with an explicit CORS_ORIGINS allowlist', () => {
      let corsApp: NestExpressApplication;

      beforeAll(async () => {
        corsApp = await createTestApp({ env: { CORS_ORIGINS: ['http://localhost:5173'] } });
      });

      afterAll(async () => {
        await corsApp.close();
      });

      it('allows only allowlisted origins for cross-origin browser calls', async () => {
        const allowed = await http(corsApp)
          .options('/invoices')
          .set('Origin', 'http://localhost:5173')
          .set('Access-Control-Request-Method', 'POST')
          .expect(204);
        expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
        expect(allowed.headers['access-control-allow-credentials']).toBe('true');
        expect(allowed.headers['access-control-allow-methods']).toBe('GET,HEAD,POST');
        expect(allowed.headers['access-control-max-age']).toBe('600');

        const denied = await http(corsApp)
          .options('/invoices')
          .set('Origin', 'https://evil.example.com')
          .set('Access-Control-Request-Method', 'POST');
        expect(denied.headers['access-control-allow-origin']).toBeUndefined();
      });
    });
  });
});
