import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { STATUS_CODES } from 'node:http';
import {
  ApplicationError,
  RateLimitedError,
  type ApplicationErrorKind,
} from '../errors/application-errors';
import { isDataException } from '../errors/sqlstate';

/** Translation of transport-agnostic application errors to HTTP. */
const HTTP_STATUS_BY_KIND: Record<ApplicationErrorKind, number> = {
  'business-rule': HttpStatus.BAD_REQUEST,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  'not-found': HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  'rate-limited': HttpStatus.TOO_MANY_REQUESTS,
};

export interface ErrorResponseBody {
  statusCode: number;
  /** string[] for validation errors, a single string otherwise. */
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  requestId?: string;
}

type ErrorSummary = Pick<ErrorResponseBody, 'statusCode' | 'message' | 'error'>;

/** Every non-2xx response goes through here, so clients always receive the same error shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const summary = summarize(exception);

    if (summary.statusCode >= 500) {
      // The full error (stack, SQL, driver details) is only ever logged; the client gets the request id to quote.
      this.logger.error({ err: exception }, 'Request failed with a server error');
    } else if (isDataException(exception)) {
      // Not the server's fault, but a validation gap worth fixing: the input should never have reached the database.
      this.logger.warn({ err: exception }, 'The database rejected a value that passed validation');
    }
    if (response.headersSent) {
      response.end();
      return;
    }
    if (exception instanceof RateLimitedError) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    const body: ErrorResponseBody = {
      ...summary,
      // The route path only: the query string is not echoed back.
      path: request.path,
      timestamp: new Date().toISOString(),
      requestId: typeof request.id === 'string' ? request.id : undefined,
    };
    response.status(summary.statusCode).json(body);
  }
}

function summarize(exception: unknown): ErrorSummary {
  if (exception instanceof ApplicationError) {
    const statusCode = HTTP_STATUS_BY_KIND[exception.kind];
    return { statusCode, message: exception.message, error: statusText(statusCode) };
  }
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      return { statusCode, message: payload, error: statusText(statusCode) };
    }
    const { message, error } = payload as { message?: unknown; error?: unknown };
    return {
      statusCode,
      message: isMessage(message) ? message : exception.message,
      error: typeof error === 'string' ? error : statusText(statusCode),
    };
  }
  // Errors raised by Express-level middleware (e.g. body-parser's 413 Payload Too Large) follow the http-errors
  // convention: a 4xx `status` plus `expose: true` when the message is safe to show to clients.
  if (isExposableClientError(exception)) {
    return {
      statusCode: exception.status,
      message: exception.message,
      error: statusText(exception.status),
    };
  }
  // Defence in depth behind validation (NUL bytes, malformed UUIDs, out-of-range values): still the client's input.
  // The database's own message may quote the value, so it is not forwarded.
  if (isDataException(exception)) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Invalid input',
      error: statusText(HttpStatus.BAD_REQUEST),
    };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
    error: statusText(HttpStatus.INTERNAL_SERVER_ERROR),
  };
}

function isMessage(value: unknown): value is string | string[] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

function isExposableClientError(
  value: unknown,
): value is { status: number; message: string; expose: true } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { status, message, expose } = value as Record<string, unknown>;
  return (
    expose === true &&
    typeof message === 'string' &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  );
}

function statusText(statusCode: number): string {
  return STATUS_CODES[statusCode] ?? 'Error';
}
