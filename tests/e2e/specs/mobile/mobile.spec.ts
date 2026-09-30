import type { Page } from '@playwright/test';
import { ANONYMOUS_STATE } from '../../support/env';
import { expect, test } from '../../support/fixtures';
import { APPENDIX_A, aud, newInvoice } from '../../support/invoices';

// Runs in the mobile-chromium project only (390 × 844, touch). Below 768 px the SPA swaps the
// invoice table for cards.

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => {
    if (!document.scrollingElement) throw new Error('No scrolling element');
    return { scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth };
  });
  expect(scrollWidth, `content width at a ${innerWidth}px wide viewport`).toBeLessThanOrEqual(
    innerWidth,
  );
}

test('lists invoices as cards, without a table or horizontal scrolling', async ({
  page,
  listPage,
}) => {
  const results = await listPage.goto();

  await expect(listPage.cardList).toBeVisible();
  await expect(listPage.table).toHaveCount(0);
  await listPage.expectInvoices(results.data);
  await expect(listPage.cardList.getByRole('listitem')).toHaveCount(results.data.length);
  await expect(listPage.nextPageButton).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('opens an invoice by tapping its card', async ({ page, listPage, detailPage }) => {
  await listPage.goto(`?keyword=${APPENDIX_A.invoiceNumber}`);
  const card = listPage.cardList
    .getByRole('listitem')
    .filter({ hasText: APPENDIX_A.invoiceNumber });
  await expect(card).toContainText(APPENDIX_A.customerName);
  await expect(card).toContainText(APPENDIX_A.status);
  await expect(card).toContainText(APPENDIX_A.invoiceDateText);
  await expect(card).toContainText(APPENDIX_A.totalText);

  // The centre of the card, not the invoice-number link: the whole card is the tap target.
  await card.tap();
  await expect(detailPage.heading(APPENDIX_A.invoiceNumber)).toBeVisible();
  await expect
    .poll(() => detailPage.readTerms(detailPage.summaryRegion))
    .toEqual(APPENDIX_A.summary);
  await expectNoHorizontalScroll(page);
});

test('creates an invoice on a phone', async ({ page, listPage, createPage }) => {
  await listPage.goto();
  await listPage.newInvoiceLink.tap();
  await expect(createPage.heading).toBeVisible();
  await expectNoHorizontalScroll(page);

  const invoice = newInvoice();
  await createPage.fillForm(invoice);
  await createPage.submitButton.scrollIntoViewIfNeeded();
  const response = await createPage.submit();
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByText(`Invoice ${invoice.invoiceNumber} created`)).toBeVisible();
  await expect(page).toHaveURL(/\/invoices$/);

  const found = await listPage.search(invoice.invoiceNumber);
  await listPage.expectInvoices(found.data);
  const card = listPage.cardList.getByRole('listitem').filter({ hasText: invoice.invoiceNumber });
  await expect(card).toContainText('Draft');
  await expect(card).toContainText(aud('104.99'));
});

test.describe('signed out', () => {
  test.use({ storageState: ANONYMOUS_STATE });

  test('fits the login screen on a phone', async ({ page, loginPage }) => {
    await loginPage.goto();
    await expect(loginPage.signInButton).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
