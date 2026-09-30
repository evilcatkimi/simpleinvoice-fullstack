import { ANONYMOUS_STATE, DEMO_USER, isSessionCookie, WEB_URL } from '../../support/env';
import { expect, test } from '../../support/fixtures';
import { isApiCall } from '../../support/http';

// Signing out revokes the token on the server, so this test signs in with a session of its own
// instead of the one every other test shares.
test.use({ storageState: ANONYMOUS_STATE });

test('signs out, revokes the session and guards the invoice screens again', async ({
  page,
  newRequestContext,
  listPage,
  loginPage,
  shell,
}) => {
  // Arranged through the API: the response's cookie lands in this browser context.
  const login = await page.request.post('/api/auth/login', {
    data: { email: DEMO_USER.email, password: DEMO_USER.password },
  });
  expect(login.status(), await login.text()).toBe(200);
  await listPage.goto();
  const sessionCookie = (await page.context().cookies()).find((cookie) =>
    isSessionCookie(cookie.name),
  );
  expect(sessionCookie, 'session cookie after signing in').toBeDefined();

  const logout = page.waitForResponse(isApiCall('POST', '/api/auth/logout'));
  await shell.signOutButton.click();
  expect((await logout).status()).toBe(204);
  await loginPage.expectVisible();
  const remaining = await page.context().cookies();
  expect(remaining.filter((cookie) => isSessionCookie(cookie.name))).toEqual([]);

  await page.goto('/invoices');
  await loginPage.expectVisible();
  await expect(listPage.heading).toBeHidden();

  // A copy of the token taken before signing out is refused as well.
  const copy = await newRequestContext({
    baseURL: WEB_URL,
    storageState: ANONYMOUS_STATE,
    extraHTTPHeaders: { Authorization: `Bearer ${sessionCookie?.value}` },
  });
  expect((await copy.get('/api/auth/me')).status()).toBe(401);
});
