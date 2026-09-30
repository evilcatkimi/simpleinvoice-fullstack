import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { configureApp } from './app.setup';
import type { AppEnvironment } from './config/environment';
import { AccessTokenCookie } from './modules/auth/infrastructure/access-token-cookie';
import { rejectDeeplyNestedJson, requireJsonBody } from './shared/http/json-body';
import { requestIdMiddleware } from './shared/http/request-id';

function setup(env: Partial<AppEnvironment> = {}) {
  const values: Partial<AppEnvironment> = {
    NODE_ENV: 'production',
    COOKIE_SECURE: true,
    TRUST_PROXY: ['10.203.47.10'],
    CORS_ORIGINS: [],
    SWAGGER_ENABLED: false,
    ...env,
  };
  const config = { get: (key: keyof AppEnvironment) => values[key] };
  const cookie = new AccessTokenCookie(config as unknown as ConfigService<AppEnvironment, true>);
  const app = {
    get: jest.fn((token: unknown) => (token === AccessTokenCookie ? cookie : config)),
    use: jest.fn(),
    set: jest.fn(),
    useBodyParser: jest.fn(),
    enableCors: jest.fn(),
  };
  configureApp(app as unknown as NestExpressApplication);
  return app;
}

/** Position of `middleware` among the app.use / useBodyParser calls, in registration order. */
function orderOf(app: ReturnType<typeof setup>, middleware: unknown): number {
  const index = app.use.mock.calls.findIndex(([registered]) => registered === middleware);
  return app.use.mock.invocationCallOrder[index];
}

describe('configureApp', () => {
  let swaggerSetup: jest.SpyInstance;
  let createDocument: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    createDocument = jest
      .spyOn(SwaggerModule, 'createDocument')
      .mockReturnValue({} as OpenAPIObject);
    swaggerSetup = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers X-Request-Id before any other middleware, so even body-parser errors carry it', () => {
    const app = setup();

    expect(app.use.mock.calls[0]).toEqual([requestIdMiddleware]);
    expect(app.use.mock.invocationCallOrder[0]).toBeLessThan(
      app.useBodyParser.mock.invocationCallOrder[0],
    );
  });

  it('limits JSON bodies to 100 kB', () => {
    expect(setup().useBodyParser).toHaveBeenCalledWith('json', { limit: '100kb' });
  });

  it('parses JSON only: other content types are refused before, deep nesting right after the parser', () => {
    const app = setup();
    const jsonParser = app.useBodyParser.mock.invocationCallOrder[0];

    expect(app.useBodyParser).toHaveBeenCalledTimes(1);
    expect(orderOf(app, requireJsonBody)).toBeLessThan(jsonParser);
    expect(orderOf(app, rejectDeeplyNestedJson)).toBeGreaterThan(jsonParser);
  });

  it('does not enable CORS at all by default: the SPA is same-origin', () => {
    expect(setup().enableCors).not.toHaveBeenCalled();
  });

  it('allows credentialed cross-origin calls from the configured origins only', () => {
    expect(
      setup({ CORS_ORIGINS: ['https://invoices.example.com'] }).enableCors,
    ).toHaveBeenCalledWith({
      origin: ['https://invoices.example.com'],
      credentials: true,
      methods: ['GET', 'HEAD', 'POST'],
      maxAge: 600,
      exposedHeaders: ['X-Request-Id', 'Location'],
    });
  });

  it('trusts exactly the configured number of proxy hops for the client IP (rate limiting)', () => {
    expect(setup({ TRUST_PROXY: 2 }).set).toHaveBeenCalledWith('trust proxy', 2);
  });

  it('trusts exactly the configured proxy addresses (compose: the nginx container)', () => {
    expect(setup({ TRUST_PROXY: ['10.203.47.10'] }).set).toHaveBeenCalledWith('trust proxy', [
      '10.203.47.10',
    ]);
  });

  it('logs a warning for each risky setting at boot', () => {
    setup({ TRUST_PROXY: 1, COOKIE_SECURE: false });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TRUST_PROXY=1'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('COOKIE_SECURE is false'));
  });

  it('does not publish the API documentation when SWAGGER_ENABLED is false', () => {
    setup({ SWAGGER_ENABLED: false });

    expect(swaggerSetup).not.toHaveBeenCalled();
  });

  it('publishes Swagger UI at /api/docs when SWAGGER_ENABLED is true', () => {
    const app = setup({ SWAGGER_ENABLED: true });

    expect(swaggerSetup).toHaveBeenCalledWith(
      'api/docs',
      app,
      {},
      expect.objectContaining({ jsonDocumentUrl: 'api/docs-json' }),
    );
  });

  it('does not keep the token pasted into Swagger UI in localStorage', () => {
    setup({ SWAGGER_ENABLED: true });

    expect(swaggerSetup).toHaveBeenCalledWith(
      'api/docs',
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ swaggerOptions: { persistAuthorization: false } }),
    );
  });

  it.each([
    [true, '__Host-si_access_token'],
    [false, 'si_access_token'],
  ])(
    'documents the session cookie under its real name (COOKIE_SECURE=%p → %s)',
    (cookieSecure, name) => {
      setup({ SWAGGER_ENABLED: true, COOKIE_SECURE: cookieSecure });

      const [[, config]] = createDocument.mock.calls as [[unknown, OpenAPIObject]];
      expect(config.components?.securitySchemes?.cookie).toEqual({
        type: 'apiKey',
        in: 'cookie',
        name,
      });
    },
  );
});
