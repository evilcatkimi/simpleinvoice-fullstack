import { randomUUID } from 'node:crypto';
import { expect, test } from '../../support/fixtures';
import { isApiCall } from '../../support/http';
import { APPENDIX_A } from '../../support/invoices';

test('opens the Appendix A invoice from the list with its server-computed amounts', async ({
  page,
  listPage,
  detailPage,
}) => {
  await listPage.goto();
  const results = await listPage.search(APPENDIX_A.invoiceNumber);
  const appendix = results.data.find(
    (invoice) => invoice.invoiceNumber === APPENDIX_A.invoiceNumber,
  );
  expect(appendix, 'Appendix A invoice in the search results').toBeDefined();

  await listPage.invoiceLink(APPENDIX_A.invoiceNumber).click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${appendix?.invoiceId}$`));
  const heading = detailPage.heading(APPENDIX_A.invoiceNumber);
  await expect(heading).toBeVisible();
  await expect(heading.getByText(APPENDIX_A.status, { exact: true })).toBeVisible();

  await expect
    .poll(() => detailPage.readTerms(detailPage.summaryRegion))
    .toEqual(APPENDIX_A.summary);
  expect(await detailPage.readTerms(detailPage.customerRegion)).toEqual(APPENDIX_A.customer);
  expect(await detailPage.readTerms(detailPage.detailsRegion)).toMatchObject(APPENDIX_A.details);
  const { name, quantity, rate, amount } = APPENDIX_A.item;
  await expect(detailPage.lineItem(name).getByRole('cell')).toHaveText([quantity, rate, amount]);

  // "Back to invoices" returns to the search the invoice was opened from.
  await detailPage.backLink.click();
  await listPage.expectQuery({ keyword: APPENDIX_A.invoiceNumber });
  await expect(listPage.searchBox).toHaveValue(APPENDIX_A.invoiceNumber);
  await listPage.expectInvoices(results.data);
});

test('"Back to invoices" restores the page, filter and sort order the invoice was opened from', async ({
  page,
  listPage,
  detailPage,
}) => {
  const listView = '?page=2&sortBy=dueDate&ordering=ASC&status=Paid';
  const pageTwo = await listPage.goto(listView);
  expect(
    pageTwo.data.length,
    'more than one page of Paid invoices in the seed data',
  ).toBeGreaterThan(0);
  const target = pageTwo.data[0]!;
  await listPage.expectInvoices(pageTwo.data);

  // A click anywhere on the row opens the invoice, not only on its number.
  await listPage.table
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: target.invoiceNumber, exact: true }) })
    .getByRole('cell')
    .first()
    .click();
  await expect(detailPage.heading(target.invoiceNumber)).toBeVisible();

  await detailPage.backLink.click();
  await listPage.expectQuery({ page: '2', sortBy: 'dueDate', ordering: 'ASC', status: 'Paid' });
  await expect(listPage.pageIndicator).toHaveText(`Page 2 of ${pageTwo.paging.totalPages}`);
  await expect(listPage.statusSelect).toHaveValue('Paid');
  await expect(listPage.sortBySelect).toHaveValue('dueDate');
  await expect(listPage.ascendingButton).toHaveAttribute('aria-pressed', 'true');
  await listPage.expectInvoices(pageTwo.data);
});

test('shows "Invoice not found" for an unknown or a malformed invoice id', async ({
  page,
  listPage,
  detailPage,
}) => {
  const unknownId = randomUUID();
  const lookups: Record<string, number> = { [unknownId]: 404, 'not-a-uuid': 400 };

  for (const [invoiceId, apiStatus] of Object.entries(lookups)) {
    const response = page.waitForResponse(isApiCall('GET', `/api/invoices/${invoiceId}`));
    await page.goto(`/invoices/${invoiceId}`);
    expect((await response).status()).toBe(apiStatus);
    await expect(detailPage.notFoundHeading).toBeVisible();
  }

  await detailPage.backLink.click();
  await expect(listPage.heading).toBeVisible();
  await listPage.expectQuery({});
});
