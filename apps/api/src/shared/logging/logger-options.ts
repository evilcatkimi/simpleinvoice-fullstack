import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { AppEnvironment } from '../../config/environment';
import { isDataExceptionCode } from '../errors/sqlstate';

/** Credentials that must never reach log storage. Personal data is kept out by the serializers below. */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'req.body.password',
];

/**
 * Fields of a TypeORM / pg error that quote data: the bound SQL parameters, the failing row ("Failing row contains
 * (…, customer name, e-mail, address, …)"), the driver's copy of both, and the PL/pgSQL context.
 */
const ERROR_FIELDS_WITH_DATA = ['parameters', 'detail', 'driverError', 'where'];

/**
 * Keeps what diagnoses an error (type, SQLSTATE, constraint, table, column, the parameterised SQL, the stack) and drops
 * what quotes customer data. A data exception (SQLSTATE class 22) quotes the rejected value in its message, e.g.
 * `invalid input syntax for type uuid: "<value>"`, so that message is replaced in the stack as well.
 */
export function serializeError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) {
    return error;
  }
  const safe: Record<string, unknown> = { ...error };
  for (const field of ERROR_FIELDS_WITH_DATA) {
    delete safe[field];
  }
  if (isDataExceptionCode(safe.code)) {
    const message = `database data exception ${String(safe.code)}`;
    safe.stack =
      typeof safe.stack === 'string' &&
      typeof safe.message === 'string' &&
      safe.stack.includes(safe.message)
        ? safe.stack.replace(safe.message, message)
        : undefined;
    safe.message = message;
  }
  return safe;
}

interface SerializedRequest {
  id?: unknown;
  method?: unknown;
  url?: string;
  headers?: unknown;
  remoteAddress?: unknown;
  remotePort?: unknown;
}

/** Search keywords are customer names: the route is logged without its query string (and without the parsed query). */
export function serializeRequest({
  id,
  method,
  url,
  headers,
  remoteAddress,
  remotePort,
}: SerializedRequest): SerializedRequest {
  return { id, method, url: url?.split('?')[0], headers, remoteAddress, remotePort };
}

export function buildLoggerOptions(config: ConfigService<AppEnvironment, true>): Params {
  const isDevelopment = config.get('NODE_ENV', { infer: true }) === 'development';
  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      // pino-http runs its standard serializers first; these then filter the result.
      serializers: { err: serializeError, req: serializeRequest },
      // `req.id` is already set by requestIdMiddleware; pino-http keeps it, so every log line carries the request id.
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) {
          return 'error';
        }
        return res.statusCode >= 400 ? 'warn' : 'info';
      },
      // The container health check polls every few seconds; logging it would drown real traffic.
      autoLogging: { ignore: (req) => req.url === '/health' },
      transport: isDevelopment
        ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' } }
        : undefined,
    },
  };
}
