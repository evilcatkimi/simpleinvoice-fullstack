import { readFileSync } from 'node:fs';
import {
  ANONYMOUS_STATE,
  API_URL,
  AUTH_STATE_PATH,
  isSessionCookie,
  WEB_URL,
} from '../../support/env';
import { apiTest as test, expect } from '../../support/fixtures';
import { CSRF_HEADERS } from '../../support/invoices';

// Browserless: plain HTTP against the API port and through nginx. Every request context states its
// credentials explicitly (a context created in a test would otherwise inherit project options) and
// is disposed by the fixture when the test ends.

/** The invoice list, on the API itself and as the SPA reaches it through nginx. */
const INVOICE_LIST_ROUTES = [
  { baseURL: API_URL, path: '/invoices' },
  { baseURL: WEB_URL, path: '/api/invoices' },
];

test('reports itself healthy, database included', async ({ newRequestContext }) => {
  const api = await newRequestContext({ baseURL: API_URL, storageState: ANONYMOUS_STATE });
  const response = await api.get('/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', db: 'up' });
});

test('answers 401 to invoice requests without a token, directly and through nginx', async ({
  newRequestContext,
}) => {
  for (const { baseURL, path } of INVOICE_LIST_ROUTES) {
    const anonymous = await newRequestContext({ baseURL, storageState: ANONYMOUS_STATE });
    const response = await anonymous.get(path);
    expect(response.status(), `${baseURL}${path}`).toBe(401);
    expect(await response.json()).toMatchObject({
      statusCode: 401,
      message: 'Authentication required',
      path: '/invoices',
    });
    // API answers carry customer and session data: never kept in a browser or shared cache.
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});

test('grants no CORS access to other origins, so their pages cannot send X-Requested-With', async ({
  newRequestContext,
}) => {
  for (const { baseURL, path } of INVOICE_LIST_ROUTES) {
    const foreign = await newRequestContext({ baseURL, storageState: ANONYMOUS_STATE });
    // The preflight a browser sends before a cross-origin POST with the CSRF header.
    const preflight = await foreign.fetch(path, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-requested-with',
      },
    });
    expect(preflight.headers()['access-control-allow-origin'], `${baseURL}${path}`).toBeUndefined();
  }
});

test('refuses a cookie-authenticated POST without X-Requested-With (CSRF)', async ({
  newRequestContext,
}) => {
  // The session cookie without the custom header: what a request forged on another site would
  // look like, should SameSite=Strict ever let the cookie through.
  const browserLike = await newRequestContext({ baseURL: WEB_URL, storageState: AUTH_STATE_PATH });
  const session = await browserLike.get('/api/auth/me');
  expect(session.status(), 'the saved cookie is a valid session').toBe(200);

  const forged = await browserLike.post('/api/invoices', { data: {} });
  expect(forged.status()).toBe(403);
  expect(await forged.json()).toMatchObject({
    statusCode: 403,
    message: 'Missing X-Requested-With: XMLHttpRequest header',
  });

  // Same cookie plus the header passes the CSRF check and reaches validation (nothing is created).
  const fromTheSpa = await browserLike.post('/api/invoices', { data: {}, headers: CSRF_HEADERS });
  expect(fromTheSpa.status()).toBe(400);
});

test('does not apply the CSRF rule to Bearer-token clients', async ({ newRequestContext }) => {
  const state = JSON.parse(readFileSync(AUTH_STATE_PATH, 'utf8')) as {
    cookies: { name: string; value: string }[];
  };
  const token = state.cookies.find((cookie) => isSessionCookie(cookie.name))?.value;
  expect(token, 'session token saved by the setup project').toBeTruthy();

  const bearerClient = await newRequestContext({
    baseURL: API_URL,
    storageState: ANONYMOUS_STATE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  // A Bearer token must be attached explicitly, so a forged cross-site request cannot carry one.
  const response = await bearerClient.post('/invoices', { data: {} });
  expect(response.status()).toBe(400);
});
