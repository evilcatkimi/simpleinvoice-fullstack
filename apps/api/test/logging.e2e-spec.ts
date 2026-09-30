import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { DataSource, QueryFailedError } from 'typeorm';
import type { AppEnvironment } from '../src/config/environment';
import { buildLoggerOptions } from '../src/shared/logging/logger-options';
import { createInvoiceBody } from './utils/invoice-builders';
import { createTestApp, http, login, resetDatabase, type Session } from './utils/test-app';

/** Personal data a client sends that must never reach log storage. */
const SENTINEL = 'SentinelCustomerName';

/**
 * The production logger configuration (redaction, serializers, levels) at level info, writing into memory. It has to
 * be in its own test file: nestjs-pino keeps one pino-http instance per module registry, created by the first app.
 */
describe('Log hygiene (e2e)', () => {
  const lines: string[] = [];
  let app: NestExpressApplication;
  let session: Session;

  beforeAll(async () => {
    app = await createTestApp({
      customize: (builder) =>
        builder.overrideProvider(PARAMS_PROVIDER_TOKEN).useFactory({
          inject: [ConfigService],
          factory: (config: ConfigService<AppEnvironment, true>) => ({
            pinoHttp: [
              { ...(buildLoggerOptions(config).pinoHttp as Options), level: 'info' },
              { write: (line: string) => void lines.push(line) },
            ],
          }),
        }),
    });
    await resetDatabase(app);
    session = await login(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    lines.length = 0;
  });

  const logged = () => lines.join('');

  it('logs searches by route: the keyword (a customer name) stays out of the logs', async () => {
    await http(app)
      .get('/invoices')
      .query({ keyword: SENTINEL, page: 1 })
      .set(session.bearer)
      .expect(200);

    expect(logged()).toContain('"url":"/invoices"');
    expect(logged()).not.toContain(SENTINEL);
  });

  it('logs a failed query with its SQLSTATE and constraint, never the failing row or bound values', async () => {
    const failingRow = new QueryFailedError(
      'INSERT INTO "invoices" (…) VALUES ($1, $2)',
      [SENTINEL, 'sentinel@example.com'],
      Object.assign(
        new Error('null value in column "customer_email" violates not-null constraint'),
        {
          code: '23502',
          table: 'invoices',
          column: 'customer_email',
          detail: `Failing row contains (…, ${SENTINEL}, sentinel@example.com, …)`,
        },
      ),
    );
    const transaction = jest
      .spyOn(app.get(DataSource), 'transaction')
      .mockRejectedValueOnce(failingRow);

    await http(app)
      .post('/invoices')
      .set(session.bearer)
      .send(createInvoiceBody({ customer: { fullname: SENTINEL, email: 'sentinel@example.com' } }))
      .expect(500);
    transaction.mockRestore();

    const errorLine = lines.find((line) => line.includes('"level":50'));
    expect(errorLine).toContain('"code":"23502"');
    expect(errorLine).toContain('"column":"customer_email"');
    expect(logged()).not.toContain(SENTINEL);
    expect(logged()).not.toContain('sentinel@example.com');
  });

  it('answers malformed input without a single error-level line', async () => {
    await http(app)
      .post('/invoices')
      .set(session.bearer)
      .send(
        createInvoiceBody({ customer: { fullname: 'Eve\u0000Null', email: 'eve@example.com' } }),
      )
      .expect(400);
    await http(app).get('/invoices?keyword=abc%00def').set(session.bearer).expect(400);

    expect(lines.length).toBeGreaterThan(0);
    expect(logged()).not.toContain('"level":50');
  });
});
