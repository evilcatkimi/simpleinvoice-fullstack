import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { configurationWarnings } from './config/configuration-warnings';
import type { AppEnvironment } from './config/environment';
import { AccessTokenCookie } from './modules/auth/infrastructure/access-token-cookie';
import { rejectDeeplyNestedJson, requireJsonBody } from './shared/http/json-body';
import { noStore } from './shared/http/no-store';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './shared/http/request-id';
import {
  BEARER_AUTH_SCHEME,
  COOKIE_AUTH_SCHEME,
  RATE_LIMITED_RESPONSE,
} from './shared/swagger/api-docs.decorators';

const JSON_BODY_LIMIT = '100kb';
const API_DOCS_PATH = 'api/docs';

/**
 * HTTP-level setup shared by main.ts and the e2e tests, so tests exercise the same middleware chain as production.
 * Middleware order is the order of the calls below. Both create the app with `bodyParser: false`: JSON is the only
 * body format the API parses (no urlencoded parser a cross-site HTML form could feed).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  const logger = new Logger('Configuration');
  for (const warning of configurationWarnings({
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    COOKIE_SECURE: config.get('COOKIE_SECURE', { infer: true }),
    TRUST_PROXY: config.get('TRUST_PROXY', { infer: true }),
  })) {
    logger.warn(warning);
  }

  // First, so that every response (even a body-parser 413) carries X-Request-Id.
  app.use(requestIdMiddleware);
  // Which proxies may set the client IP (the rate-limiting key) through X-Forwarded-For: compose trusts nginx only.
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // TLS terminates in front of the API (and is absent in local dev). Upgrading Swagger UI's same-origin
          // assets to https:// would break /api/docs whenever it is served over plain HTTP.
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(noStore(`/${API_DOCS_PATH}`));
  // The SPA is same-origin behind the proxy and needs no CORS; other browser origins must be listed explicitly.
  // Registered before the body checks so that their 4xx answers stay readable by an allowlisted origin.
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST'],
      maxAge: 600,
      exposedHeaders: [REQUEST_ID_HEADER, 'Location'],
    });
  }
  app.use(cookieParser());
  app.use(requireJsonBody);
  // Small, explicit JSON limit: an invoice is a few hundred bytes, so anything larger is abuse.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(rejectDeeplyNestedJson);

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app, app.get(AccessTokenCookie).name);
  }
}

function setupSwagger(app: NestExpressApplication, cookieName: string): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SimpleInvoice API')
      .setDescription(
        'Invoices with server-side totals and derived Overdue status. Authenticate with POST /auth/login, then ' +
          'use the returned token as a Bearer token (the browser SPA uses the HttpOnly cookie instead).',
      )
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_AUTH_SCHEME)
      .addCookieAuth(
        cookieName,
        { type: 'apiKey', in: 'cookie', name: cookieName },
        COOKIE_AUTH_SCHEME,
      )
      .addGlobalResponse(RATE_LIMITED_RESPONSE)
      .build(),
  );
  SwaggerModule.setup(API_DOCS_PATH, app, document, {
    jsonDocumentUrl: `${API_DOCS_PATH}-json`,
    // The token pasted into "Authorize" is not kept in localStorage, where any script on this origin could read it.
    swaggerOptions: { persistAuthorization: false },
  });
}
