import type { Response } from '@playwright/test';
import { AUTH_STATE_PATH, DEMO_USER } from '../support/env';
import { expect, test as setup } from '../support/fixtures';

/** Explains a refused login, with what to do about the two limits a test run can run into. */
function loginRefusal(response: Response): string {
  if (response.status() !== 429) return `POST /api/auth/login answered ${response.status()}`;
  const headers = response.headers();
  return (
    'The API refused the login with 429: too many logins from this IP (limit ' +
    `${headers['x-ratelimit-limit-login'] ?? '?'} per window) or too many failed attempts on the ` +
    `account. Retry in ${headers['retry-after-login'] ?? headers['retry-after'] ?? '?'} s; ` +
    'tests/e2e/docker-compose.e2e.yml (make test-e2e) raises the per-IP limit for test runs.'
  );
}

/**
 * Signs in through the UI once per run and saves the browser storage (the HttpOnly session cookie)
 * for every signed-in test: the API only accepts a few logins per minute from one client IP.
 */
setup('sign in as the demo reviewer', async ({ page, loginPage, listPage }) => {
  await loginPage.goto();
  const response = await loginPage.signIn(DEMO_USER);
  expect(response.status(), loginRefusal(response)).toBe(200);
  await expect(listPage.heading).toBeVisible();

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
