import { expect, test } from '../../support/fixtures';
import { APPENDIX_A } from '../../support/invoices';

/** "default-src 'self'; object-src 'none'" → { 'default-src': "'self'", 'object-src': "'none'" } */
function parseCsp(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => Boolean(name))
      .map(([name = '', ...sources]): [string, string] => [name, sources.join(' ')]),
  );
}

test('serves the SPA document with strict security headers', async ({ page }) => {
  // A deep link, answered by nginx's SPA fallback (index.html).
  const response = await page.goto('/invoices');
  expect(response, 'document response').not.toBeNull();
  const headers = (await response?.allHeaders()) ?? {};

  expect(parseCsp(headers['content-security-policy'] ?? '')).toMatchObject({
    'default-src': "'self'",
    'script-src': "'self'",
    'connect-src': "'self'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'none'",
  });
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('renders every main screen without CSP violations or uncaught errors', async ({
  page,
  listPage,
  detailPage,
  createPage,
  browserErrors,
}) => {
  await listPage.goto(`?keyword=${APPENDIX_A.invoiceNumber}`);
  await listPage.invoiceLink(APPENDIX_A.invoiceNumber).click();
  await expect(detailPage.summaryRegion).toBeVisible();
  await createPage.goto();
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to invoices' }).click();
  await expect(listPage.heading).toBeVisible();

  expect(browserErrors.takeCspViolations()).toEqual([]);
  expect(browserErrors.uncaughtErrors).toEqual([]);
});

test('enforces the CSP: an injected inline script is blocked and reported', async ({
  page,
  listPage,
  browserErrors,
}) => {
  await listPage.goto();
  const reported = page.waitForEvent('console', (message) =>
    message.text().includes('Content Security Policy'),
  );

  const executed = await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.injected = "yes";';
    document.body.append(script);
    return document.documentElement.dataset.injected === 'yes';
  });

  expect(executed, 'inline script executed').toBe(false);
  expect((await reported).text()).toContain("script-src 'self'");
  // The guard that fails every other test saw it too, which proves it is not a silent no-op.
  expect(browserErrors.takeCspViolations()).toHaveLength(1);
});
