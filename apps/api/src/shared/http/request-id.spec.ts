import type { NextFunction, Request, Response } from 'express';
import { requestIdMiddleware, resolveRequestId } from './request-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it.each(['abc-123', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'A'.repeat(64)])(
    'reuses a well-formed caller id (%s)',
    (incoming) => {
      expect(resolveRequestId(incoming)).toBe(incoming);
    },
  );

  it.each([
    ['too long', 'A'.repeat(65)],
    ['whitespace', 'abc 123'],
    ['log injection', 'abc\nlevel=error msg=forged'],
    ['markup', '<script>'],
    ['empty', ''],
  ])('generates a UUID when the caller id is unsafe (%s)', (_reason, incoming) => {
    expect(resolveRequestId(incoming)).toMatch(UUID_PATTERN);
  });

  it('generates a UUID when the header is missing or repeated', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_PATTERN);
    expect(resolveRequestId(['a', 'b'])).toMatch(UUID_PATTERN);
  });
});

describe('requestIdMiddleware', () => {
  it('stores the id on the request, echoes it in X-Request-Id and continues', () => {
    const request = { headers: { 'x-request-id': 'trace-42' } } as unknown as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next: NextFunction = jest.fn();

    requestIdMiddleware(request, response, next);

    expect(request.id).toBe('trace-42');
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'trace-42');
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ['a forged log line', 'abc\nlevel=error msg=forged'],
    ['a 65-character id', 'A'.repeat(65)],
    ['no id at all', undefined],
  ])(
    'replaces %s with a fresh UUID before it reaches the logs or the response',
    (_case, incoming) => {
      const headers = incoming === undefined ? {} : { 'x-request-id': incoming };
      const request = { headers } as unknown as Request;
      const response = { setHeader: jest.fn() } as unknown as Response;

      requestIdMiddleware(request, response, jest.fn());

      expect(request.id).toMatch(UUID_PATTERN);
      expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', request.id);
    },
  );
});
