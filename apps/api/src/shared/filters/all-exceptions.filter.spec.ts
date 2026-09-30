import {
  BadRequestException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { PinoLogger } from 'nestjs-pino';
import { QueryFailedError } from 'typeorm';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
} from '../errors/application-errors';
import { AllExceptionsFilter } from './all-exceptions.filter';

function setup({
  headersSent = false,
  request = { path: '/invoices', id: 'req-123' },
}: { headersSent?: boolean; request?: Record<string, unknown> } = {}) {
  const logger = { error: jest.fn(), warn: jest.fn() };
  const response = {
    headersSent,
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    end: jest.fn(),
    setHeader: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter(logger as unknown as PinoLogger);
  const catchError = (exception: unknown) => filter.catch(exception, host);
  return { logger, response, catchError };
}

describe('AllExceptionsFilter', () => {
  it('renders HttpExceptions in the contract error shape', () => {
    const { response, catchError, logger } = setup();

    catchError(new NotFoundException('Invoice not found'));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Invoice not found',
      error: 'Not Found',
      path: '/invoices',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) as string,
      requestId: 'req-123',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    [
      new BusinessRuleViolationError('discount must not exceed subtotal plus tax'),
      400,
      'Bad Request',
    ],
    [new UnauthenticatedError('Invalid email or password'), 401, 'Unauthorized'],
    [new NotFoundError('Invoice not found'), 404, 'Not Found'],
    [new ConflictError('Invoice number already exists'), 409, 'Conflict'],
  ])('translates %p to HTTP %i', (exception, statusCode, error) => {
    const { response, catchError, logger } = setup();

    catchError(exception);

    expect(response.status).toHaveBeenCalledWith(statusCode);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode, message: exception.message, error }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps validation messages as an array', () => {
    const { response, catchError } = setup();

    catchError(new BadRequestException(['dueDate must be on or after invoiceDate']));

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['dueDate must be on or after invoiceDate'],
        error: 'Bad Request',
      }),
    );
  });

  it('derives the error name from the status when the exception carries a plain string', () => {
    const { response, catchError } = setup();

    catchError(new HttpException('Too many requests, please try again later', 429));

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        message: 'Too many requests, please try again later',
        error: 'Too Many Requests',
      }),
    );
  });

  it('maps client errors raised by Express middleware, such as body-parser 413', () => {
    const { response, catchError } = setup();
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });

    catchError(tooLarge);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'request entity too large', error: 'Payload Too Large' }),
    );
  });

  it('hides unexpected errors behind a generic 500 and logs the real error', () => {
    const { response, catchError, logger } = setup();
    const failure = new Error('connection to db-internal:5432 refused');

    catchError(failure);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
        requestId: 'req-123',
      }),
    );
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('db-internal');
    expect(logger.error).toHaveBeenCalledWith({ err: failure }, expect.any(String));
  });

  it('does not trust a status on errors that are not marked safe to expose', () => {
    const { response, catchError } = setup();

    catchError(Object.assign(new Error('secret detail'), { status: 400, expose: false }));

    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('renders the rate limiter rejection as 429 with the configured message', () => {
    const { response, catchError, logger } = setup();

    catchError(new ThrottlerException('Too many requests, please try again later'));

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        message: 'Too many requests, please try again later',
        error: 'Too Many Requests',
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps the message of 5xx HttpExceptions thrown on purpose, and logs them', () => {
    const { response, catchError, logger } = setup();
    const unavailable = new ServiceUnavailableException('Database unavailable');

    catchError(unavailable);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        message: 'Database unavailable',
        error: 'Service Unavailable',
      }),
    );
    expect(logger.error).toHaveBeenCalledWith({ err: unavailable }, expect.any(String));
  });

  it('never forwards a payload message that is not text', () => {
    const { response, catchError } = setup();

    catchError(new HttpException({ message: { sql: 'SELECT secret' } }, 400));

    const [[body]] = response.json.mock.calls as [[{ message: unknown }]];
    expect(typeof body.message).toBe('string');
    expect(JSON.stringify(body)).not.toContain('SELECT');
  });

  it.each([
    ['a string', 'connection refused'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
  ])('answers a generic 500 when %s is thrown instead of an Error', (_kind, thrown) => {
    const { response, catchError, logger } = setup();

    catchError(thrown);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
    expect(logger.error).toHaveBeenCalledWith({ err: thrown }, expect.any(String));
  });

  it('never exposes server-side (5xx) middleware errors, even when marked exposable', () => {
    const { response, catchError } = setup();

    catchError(
      Object.assign(new Error('upstream db-internal:5432 timed out'), {
        status: 502,
        expose: true,
      }),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('db-internal');
  });

  it('reports the route path without echoing the query string', () => {
    const { response, catchError } = setup({
      request: {
        path: '/invoices',
        originalUrl: '/invoices?keyword=Jane%20Doe',
        url: '/invoices?keyword=Jane%20Doe',
        id: 'req-123',
      },
    });

    catchError(
      new BadRequestException(['keyword must be shorter than or equal to 100 characters']),
    );

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ path: '/invoices' }));
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('Jane');
  });

  it('answers 429 with Retry-After when an application limit is reached', () => {
    const { response, catchError, logger } = setup();

    catchError(new RateLimitedError('Too many attempts, try again later', 842));

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '842');
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        message: 'Too many attempts, try again later',
        error: 'Too Many Requests',
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('answers 400 when the database rejects a value as malformed, without quoting it back', () => {
    const { response, catchError, logger } = setup();
    const rejected = new QueryFailedError(
      'SELECT … WHERE "id" = $1',
      ["x' OR '1'='1"],
      Object.assign(new Error(`invalid input syntax for type uuid: "x' OR '1'='1"`), {
        code: '22P02',
      }),
    );

    catchError(rejected);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid input', error: 'Bad Request' }),
    );
    expect(JSON.stringify(response.json.mock.calls)).not.toContain("1'='1");
    // Logged as a warning (a validation gap to fix), never as a server error.
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({ err: rejected }, expect.any(String));
  });

  it('still treats other database errors as server errors', () => {
    const { response, catchError, logger } = setup();

    catchError(
      new QueryFailedError('INSERT …', [], Object.assign(new Error('deadlock'), { code: '40P01' })),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('only ends the response when headers were already sent', () => {
    const { response, catchError } = setup({ headersSent: true });

    catchError(new Error('late failure'));

    expect(response.end).toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
