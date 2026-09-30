import type { Request, Response } from '@playwright/test';

/**
 * Matches a request, or the response to one, by HTTP method and path (query string ignored):
 * `page.waitForResponse(isApiCall('POST', '/api/invoices'))`.
 */
export function isApiCall(method: string, path: string) {
  return (message: Request | Response): boolean => {
    const request = 'request' in message ? message.request() : message;
    return request.method() === method && new URL(request.url()).pathname === path;
  };
}
