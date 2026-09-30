import type { ConfigService } from '@nestjs/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp, type AutoLoggingOptions, type Options } from 'pino-http';
import { QueryFailedError } from 'typeorm';
import type { AppEnvironment } from '../../config/environment';
import { buildLoggerOptions, serializeError, serializeRequest } from './logger-options';

function pinoHttpOptions(env: Partial<AppEnvironment> = {}): Options {
  const values: Partial<AppEnvironment> = { NODE_ENV: 'production', LOG_LEVEL: 'info', ...env };
  const config = { get: (key: keyof AppEnvironment) => values[key] };
  return buildLoggerOptions(config as unknown as ConfigService<AppEnvironment, true>)
    .pinoHttp as Options;
}

/**
 * Writes `entry` through the logger pino-http builds from the API's options (redaction, and the serializers wrapped
 * around pino's standard ones), and returns the JSON line.
 */
function logLine(entry: object): string {
  let output = '';
  const { logger } = pinoHttp(pinoHttpOptions(), {
    write: (line: string) => void (output += line),
  });
  logger.info(entry, 'entry');
  return output;
}

/** What TypeORM throws: the pg error's fields (detail, code, table, …) are copied onto the QueryFailedError. */
function queryFailed(
  message: string,
  fields: object,
  parameters: unknown[] = [],
): QueryFailedError {
  return new QueryFailedError(
    'INSERT INTO "invoices" ("customer_fullname", "customer_email") VALUES ($1, $2)',
    parameters,
    Object.assign(new Error(message), fields),
  );
}

describe('buildLoggerOptions', () => {
  it('redacts credentials, cookies and SQL parameters (personal data) from log lines', () => {
    const line = logLine({
      req: {
        headers: {
          authorization: 'Bearer header.payload.signature',
          cookie: 'si_access_token=header.payload.signature',
        },
        body: { email: 'reviewer@simpleinvoice.dev', password: 'Reviewer@2026' },
      },
      res: { headers: { 'set-cookie': 'si_access_token=header.payload.signature; HttpOnly' } },
      login: { password: 'Reviewer@2026' },
      err: { message: 'duplicate key', parameters: ['jane@example.com', 'Jane Doe'] },
    });

    expect(line).toContain('[REDACTED]');
    for (const secret of ['header.payload.signature', 'Reviewer@2026', 'jane@example.com']) {
      expect(line).not.toContain(secret);
    }
    // Only the sensitive values are masked; the rest of the entry stays useful.
    expect(line).toContain('duplicate key');
  });

  it('keeps the failing row, bound values and driver copies of a database error out of the logs', () => {
    const error = queryFailed(
      'null value in column "customer_fullname" of relation "invoices" violates not-null constraint',
      {
        code: '23502',
        table: 'invoices',
        column: 'customer_fullname',
        detail: 'Failing row contains (2862e196, INV-1, Jane Doe, jane@example.com, 12 George St)',
        where: 'SQL statement "INSERT …" (Jane Doe)',
      },
      ['Jane Doe', 'jane@example.com'],
    );

    const line = logLine({ err: error });

    for (const data of ['Jane Doe', 'jane@example.com', 'George St', 'Failing row']) {
      expect(line).not.toContain(data);
    }
    // What diagnoses the failure is still there.
    const { err } = JSON.parse(line) as { err: Record<string, unknown> };
    expect(err).toMatchObject({
      type: 'QueryFailedError',
      code: '23502',
      table: 'invoices',
      column: 'customer_fullname',
    });
    expect(err.query).toContain('INSERT INTO "invoices"');
    expect(err.stack).toContain('violates not-null constraint');
  });

  it('replaces the message of a data exception, which quotes the rejected value, in the stack too', () => {
    const error = queryFailed(`invalid input syntax for type uuid: "x' OR '1'='1"`, {
      code: '22P02',
    });

    const line = logLine({ err: error });

    expect(line).not.toContain("OR '1'='1");
    const { err } = JSON.parse(line) as { err: { message: string; stack: string } };
    expect(err.message).toBe('database data exception 22P02');
    expect(err.stack).toMatch(/^QueryFailedError: database data exception 22P02\n\s+at /);
  });

  it('logs the route without its query string: search keywords are customer names', () => {
    const line = logLine({
      req: {
        method: 'GET',
        url: '/invoices?keyword=Jane%20Doe&page=2',
        originalUrl: '/invoices?keyword=Jane%20Doe&page=2',
        query: { keyword: 'Jane Doe', page: '2' },
        headers: { host: 'localhost' },
      },
    });

    expect(line).not.toContain('Jane');
    expect(JSON.parse(line)).toMatchObject({
      req: { method: 'GET', url: '/invoices', headers: { host: 'localhost' } },
    });
  });

  it('logs server errors as error, client errors as warn and everything else as info', () => {
    const { customLogLevel } = pinoHttpOptions();
    const levelFor = (statusCode: number, error?: Error) =>
      customLogLevel?.({} as IncomingMessage, { statusCode } as ServerResponse, error);

    expect(levelFor(500)).toBe('error');
    expect(levelFor(200, new Error('stream aborted'))).toBe('error');
    expect(levelFor(404)).toBe('warn');
    expect(levelFor(429)).toBe('warn');
    expect(levelFor(201)).toBe('info');
  });

  it('does not log the container health probe', () => {
    const { ignore } = pinoHttpOptions().autoLogging as AutoLoggingOptions;

    expect(ignore?.({ url: '/health' } as IncomingMessage)).toBe(true);
    expect(ignore?.({ url: '/invoices' } as IncomingMessage)).toBe(false);
  });

  it('uses the configured level', () => {
    expect(pinoHttpOptions({ LOG_LEVEL: 'warn' }).level).toBe('warn');
  });

  it('pretty-prints in development only: other environments emit JSON lines for log shipping', () => {
    expect(pinoHttpOptions({ NODE_ENV: 'development' }).transport).toMatchObject({
      target: 'pino-pretty',
    });
    expect(pinoHttpOptions({ NODE_ENV: 'production' }).transport).toBeUndefined();
    expect(pinoHttpOptions({ NODE_ENV: 'test' }).transport).toBeUndefined();
  });
});

describe('serializeError', () => {
  it.each([
    ['a string', 'connection refused'],
    ['null', null],
    ['a number', 42],
  ])('passes %s through unchanged (anything can be thrown)', (_kind, thrown) => {
    expect(serializeError(thrown)).toBe(thrown);
  });

  it('drops the stack of a data exception whose message it cannot find there', () => {
    expect(
      serializeError({ code: '22021', message: 'invalid byte sequence', stack: 'rewritten' }),
    ).toEqual({ code: '22021', message: 'database data exception 22021', stack: undefined });
  });
});

describe('serializeRequest', () => {
  it('keeps a URL without a query string as it is', () => {
    expect(serializeRequest({ method: 'GET', url: '/health' })).toMatchObject({ url: '/health' });
  });
});
