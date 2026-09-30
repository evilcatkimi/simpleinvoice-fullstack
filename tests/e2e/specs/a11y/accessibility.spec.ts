import { expectAccessible } from '../../support/accessibility';
import { ANONYMOUS_STATE } from '../../support/env';
import { expect, test } from '../../support/fixtures';
import { APPENDIX_A } from '../../support/invoices';

// Runs in both browser projects (1440 px table layout, 390 px card layout). Each screen is checked
// once it is fully rendered; the forms are checked with their field errors showing.

test.describe('no serious or critical accessibility violations', () => {
  test.describe('signed out', () => {
    test.use({ storageState: ANONYMOUS_STATE });

    test('login screen, with field errors', async ({ page, loginPage }) => {
      await loginPage.goto();
      await loginPage.signInButton.click();
      await expect(loginPage.email).toHaveAccessibleDescription('Email is required');
      await expectAccessible(page);
    });
  });

  test('invoice list', async ({ page, listPage }) => {
    const results = await listPage.goto();
    await listPage.expectInvoices(results.data);
    await expectAccessible(page);
  });

  test('invoice detail', async ({ page, listPage, detailPage }) => {
    await listPage.goto(`?keyword=${APPENDIX_A.invoiceNumber}`);
    await listPage.invoiceLink(APPENDIX_A.invoiceNumber).click();
    await expect(detailPage.heading(APPENDIX_A.invoiceNumber)).toBeVisible();
    await expect(detailPage.summaryRegion).toBeVisible();
    await expectAccessible(page);
  });

  test('new invoice form, with field errors', async ({ page, createPage }) => {
    await createPage.goto();
    await createPage.submitButton.click();
    await createPage.expectFieldError(createPage.customerName, 'Customer name is required');
    await expectAccessible(page);
  });

  test('page not found', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expectAccessible(page);
  });
});
