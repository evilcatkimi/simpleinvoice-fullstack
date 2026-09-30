import type { Request, Response } from 'express';
import { noStore } from './no-store';

function cacheControlFor(path: string): string | undefined {
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => void (headers[name] = value),
  } as unknown as Response;
  const next = jest.fn();

  noStore('/api/docs')({ path } as Request, response, next);

  expect(next).toHaveBeenCalledWith();
  return headers['Cache-Control'];
}

describe('noStore', () => {
  it.each([
    '/invoices',
    '/invoices/099ca7da-a290-40fa-93b9-1c43ae7bb887',
    '/auth/me',
    '/auth/login',
  ])('forbids caching %s (customer data and session details)', (path) => {
    expect(cacheControlFor(path)).toBe('no-store');
  });

  it.each(['/api/docs', '/api/docs/swagger-ui.css', '/api/docs-json'])(
    'leaves the static API documentation (%s) cacheable',
    (path) => {
      expect(cacheControlFor(path)).toBeUndefined();
    },
  );
});
