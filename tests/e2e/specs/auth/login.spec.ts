import { ANONYMOUS_STATE, DEMO_USER, isSessionCookie } from '../../support/env';
import { expect, test } from '../../support/fixtures';
import { isApiCall } from '../../support/http';

// Every test here starts signed out. Logins are rate-limited per client IP, so this file makes
// exactly three login requests per run; the other signed-in tests reuse the setup project's session.
test.use({ storageState: ANONYMOUS_STATE });

test('sends anonymous visitors to the login screen and back to the page they asked for', async ({
  page,
  loginPage,
  createPage,
}) => {
  await page.goto('/invoices');
  await loginPage.expectVisible();

  await page.goto('/invoices/new');
  await loginPage.expectVisible();

  const response = await loginPage.signIn(DEMO_USER);
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/invoices\/new$/);
  await expect(createPage.heading).toBeVisible();
});

test('rejects wrong credentials, then signs in to the invoice list with the token out of reach of scripts', async ({
  page,
  loginPage,
  listPage,
  shell,
}) => {
  await loginPage.goto();
  const rejected = await loginPage.signIn({
    email: DEMO_USER.email,
    password: `${DEMO_USER.password}-wrong`,
  });
  expect(rejected.status()).toBe(401);
  await expect(loginPage.alert).toContainText('Invalid email or password');
  await expect(page).toHaveURL(/\/login$/);

  const accepted = await loginPage.signIn(DEMO_USER);
  expect(accepted.status()).toBe(200);
  // The invoice list is the home screen.
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(listPage.heading).toBeVisible();
  await expect(shell.signedInUser(DEMO_USER.fullname)).toBeVisible();

  // The JWT lives only in an HttpOnly, SameSite=Strict cookie: nothing a script can read holds it.
  const visibleToScripts = await page.evaluate(() => ({
    cookie: document.cookie,
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
  }));
  expect(visibleToScripts.cookie).not.toContain('si_access_token');
  expect(visibleToScripts.localStorage).toEqual([]);
  expect(visibleToScripts.sessionStorage).toEqual([]);

  const sessionCookie = (await page.context().cookies()).find((cookie) =>
    isSessionCookie(cookie.name),
  );
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
});

test('validates the form in the browser before calling the API', async ({ page, loginPage }) => {
  const loginRequests: string[] = [];
  page.on('request', (request) => {
    if (isApiCall('POST', '/api/auth/login')(request)) loginRequests.push(request.url());
  });
  await loginPage.goto();

  await loginPage.signInButton.click();
  await expect(loginPage.email).toHaveAccessibleDescription('Email is required');
  await expect(loginPage.email).toHaveAttribute('aria-invalid', 'true');
  await expect(loginPage.password).toHaveAccessibleDescription('Password is required');

  await loginPage.email.fill('reviewer-at-example');
  await loginPage.password.fill('any password');
  await loginPage.signInButton.click();
  await expect(loginPage.email).toHaveAccessibleDescription('Enter a valid email address');
  await expect(loginPage.password).not.toHaveAttribute('aria-invalid');

  expect(loginRequests).toEqual([]);
  await expect(page).toHaveURL(/\/login$/);
});
