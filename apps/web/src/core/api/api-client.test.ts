import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiErrorResponse } from '@/test-support/fake-api';
import { server } from '@/test-support/msw-server';
import {
  ApiError,
  apiRequest,
  getErrorMessage,
  NETWORK_ERROR_STATUS,
  setUnauthorizedHandler,
} from './api-client';

/** Resolves with whatever `promise` rejects with (fails the test if it resolves). */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.fail('expected the request to fail'),
    (error: unknown) => error,
  );
}

describe('apiRequest', () => {
  it('sends JSON with the CSRF header and same-origin credentials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let received: Request | undefined;
    server.use(
      http.post('/api/echo', ({ request }) => {
        received = request.clone();
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(apiRequest('/echo', { method: 'POST', body: { a: 1 } })).resolves.toEqual({
      ok: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${window.location.origin}/api/echo`,
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(received?.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(received?.headers.get('Accept')).toBe('application/json');
    expect(received?.headers.get('Content-Type')).toBe('application/json');
    await expect(received?.json()).resolves.toEqual({ a: 1 });
  });

  it('adds only the query parameters that have a value', async () => {
    let url: URL | undefined;
    server.use(
      http.get('/api/items', ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );

    await apiRequest('/items', {
      query: { page: 2, keyword: 'paul', status: undefined, fromDate: '' },
    });

    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({ page: '2', keyword: 'paul' });
  });

  it('resolves to undefined for 204 No Content', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns an API error body into an ApiError with every message', async () => {
    server.use(
      http.post('/api/invoices', () =>
        apiErrorResponse(
          400,
          ['dueDate must be on or after invoiceDate', 'rate must be positive'],
          'Bad Request',
        ),
      ),
    );

    const error = await rejectionOf(apiRequest('/invoices', { method: 'POST', body: {} }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      messages: ['dueDate must be on or after invoiceDate', 'rate must be positive'],
      error: 'Bad Request',
      requestId: 'req-test-123',
    });
  });

  it('copes with non-JSON error pages from a proxy', async () => {
    server.use(
      http.post(
        '/api/invoices',
        () =>
          new HttpResponse('<html>413 Request Entity Too Large</html>', {
            status: 413,
            headers: { 'Content-Type': 'text/html', 'X-Request-Id': 'nginx-42' },
          }),
      ),
    );

    const error = await rejectionOf(apiRequest('/invoices', { method: 'POST', body: {} }));

    expect(error).toMatchObject({
      status: 413,
      messages: ['Request failed with status 413'],
      requestId: 'nginx-42',
    });
  });

  it('sends neither a body nor a Content-Type on GET requests', async () => {
    let received: Request | undefined;
    server.use(
      http.get('/api/invoices', ({ request }) => {
        received = request.clone();
        return HttpResponse.json([]);
      }),
    );

    await apiRequest('/invoices');

    expect(received?.headers.has('Content-Type')).toBe(false);
    await expect(received?.text()).resolves.toBe('');
  });

  it('falls back to a generic message when a JSON error body cannot be parsed', async () => {
    server.use(
      http.get(
        '/api/invoices',
        () =>
          new HttpResponse('{"statusCode": 502, "message": ', {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'gw-7' },
          }),
      ),
    );

    const error = await rejectionOf(apiRequest('/invoices'));

    expect(error).toMatchObject({
      status: 502,
      messages: ['Request failed with status 502'],
      requestId: 'gw-7',
    });
  });

  it.each([
    ['a JSON string', '"Bad gateway"'],
    ['JSON null', 'null'],
  ])('ignores an error body that is %s rather than an object', async (_kind, body) => {
    server.use(
      http.get(
        '/api/invoices',
        () =>
          new HttpResponse(body, { status: 503, headers: { 'Content-Type': 'application/json' } }),
      ),
    );

    const error = await rejectionOf(apiRequest('/invoices'));

    expect(error).toMatchObject({ status: 503, messages: ['Request failed with status 503'] });
  });

  it('keeps only non-blank text messages from the error body', async () => {
    server.use(
      http.post('/api/invoices', () =>
        HttpResponse.json(
          { statusCode: 400, message: ['', '   ', 42, null, 'rate must be positive'] },
          { status: 400 },
        ),
      ),
    );

    const error = await rejectionOf(apiRequest('/invoices', { method: 'POST', body: {} }));

    expect(error).toMatchObject({ messages: ['rate must be positive'] });
  });

  it('reads the request id from X-Request-Id when the body has none', async () => {
    server.use(
      http.get('/api/invoices', () =>
        HttpResponse.json(
          { statusCode: 404, message: 'Not Found' },
          { status: 404, headers: { 'X-Request-Id': 'hdr-99' } },
        ),
      ),
    );

    await expect(apiRequest('/invoices')).rejects.toMatchObject({ requestId: 'hdr-99' });
  });

  it('reports a network failure as status 0', async () => {
    server.use(http.get('/api/invoices', () => HttpResponse.error()));

    const error = await rejectionOf(apiRequest('/invoices'));

    expect(error).toMatchObject({ status: NETWORK_ERROR_STATUS });
    expect(getErrorMessage(error)).toMatch(/unable to reach the server/i);
  });

  it('lets cancellations through untouched', async () => {
    server.use(
      http.get('/api/invoices', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const controller = new AbortController();

    const request = apiRequest('/invoices', { signal: controller.signal });
    controller.abort();

    const error = await rejectionOf(request);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });

  describe('on 401', () => {
    it('notifies the unauthorized handler (expired session)', async () => {
      const onUnauthorized = vi.fn();
      const unregister = setUnauthorizedHandler(onUnauthorized);
      server.use(
        http.get('/api/invoices', () => apiErrorResponse(401, 'Unauthorized', 'Unauthorized')),
      );

      await expect(apiRequest('/invoices')).rejects.toMatchObject({ status: 401 });

      expect(onUnauthorized).toHaveBeenCalledOnce();
      unregister();
    });

    it('stays silent when 401 is an expected answer, e.g. wrong credentials', async () => {
      const onUnauthorized = vi.fn();
      const unregister = setUnauthorizedHandler(onUnauthorized);

      await expect(
        apiRequest('/auth/login', {
          method: 'POST',
          body: { email: 'reviewer@simpleinvoice.dev', password: 'wrong' },
          notifyUnauthorized: false,
        }),
      ).rejects.toMatchObject({ status: 401, messages: ['Invalid email or password'] });

      expect(onUnauthorized).not.toHaveBeenCalled();
      unregister();
    });

    it('still rejects when no handler is registered (e.g. before the guard mounts)', async () => {
      server.use(
        http.get('/api/invoices', () => apiErrorResponse(401, 'Unauthorized', 'Unauthorized')),
      );

      await expect(apiRequest('/invoices')).rejects.toBeInstanceOf(ApiError);
    });

    it('keeps the newest handler when an older registration is cleaned up late', async () => {
      const older = vi.fn();
      const newer = vi.fn();
      const unregisterOlder = setUnauthorizedHandler(older);
      const unregisterNewer = setUnauthorizedHandler(newer);
      unregisterOlder(); // e.g. React StrictMode running the first effect cleanup after the second effect
      server.use(
        http.get('/api/invoices', () => apiErrorResponse(401, 'Unauthorized', 'Unauthorized')),
      );

      await expect(apiRequest('/invoices')).rejects.toMatchObject({ status: 401 });

      expect(newer).toHaveBeenCalledOnce();
      expect(older).not.toHaveBeenCalled();
      unregisterNewer();
    });
  });
});

describe('getErrorMessage', () => {
  it.each([
    [new ApiError(401, ['Invalid email or password']), 'Invalid email or password'],
    [
      new ApiError(429, ['Too many requests, please try again later']),
      'Too many attempts. Please wait a few minutes and try again.',
    ],
    [new ApiError(500, ['Internal server error']), 'Something went wrong. Please try again.'],
    [
      new ApiError(503, ['connection to db-internal:5432 refused']),
      'Something went wrong. Please try again.',
    ],
    [
      new ApiError(403, ['Missing X-Requested-With: XMLHttpRequest header']),
      'This request was refused. Reload the page and try again.',
    ],
    [
      new ApiError(413, ['Request failed with status 413']),
      'The request is too large. Shorten the text and try again.',
    ],
    [
      new ApiError(NETWORK_ERROR_STATUS, [
        'Unable to reach the server. Check your connection and try again.',
      ]),
      'Unable to reach the server. Check your connection and try again.',
    ],
    [new TypeError('boom'), 'Something went wrong. Please try again.'],
    ['a thrown string', 'Something went wrong. Please try again.'],
  ])('describes %o for the user', (error, message) => {
    expect(getErrorMessage(error)).toBe(message);
  });
});
