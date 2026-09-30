import { randomBytes } from 'node:crypto';
import { expect, test } from '../../support/fixtures';
import { isApiCall } from '../../support/http';
import { APPENDIX_A, isNonDecreasing, parseMoney } from '../../support/invoices';

// Other tests create invoices while these run, so nothing here depends on absolute counts: each
// assertion compares the screen with the API response it triggered, or isolates known seed data.

test('shows the invoice columns, the first page and the result summary', async ({ listPage }) => {
  const results = await listPage.goto();

  await expect(listPage.table.getByRole('columnheader')).toHaveText([
    'Invoice number',
    'Customer name',
    'Invoice date',
    'Due date',
    'Total amount',
    'Status',
  ]);
  expect(results.data).toHaveLength(Math.min(10, results.paging.total));
  await listPage.expectInvoices(results.data);
  await expect(listPage.resultSummary).toHaveText(
    listPage.summaryText(1, results.data.length, results.paging.total),
  );
  await expect(listPage.pageIndicator).toHaveText(`Page 1 of ${results.paging.totalPages}`);
  await expect(listPage.previousPageButton).toBeDisabled();
});

test('finds invoices by a case-insensitive partial keyword kept in the URL', async ({
  page,
  listPage,
}) => {
  await listPage.goto();

  const results = await listPage.search('pAu');
  await listPage.expectQuery({ keyword: 'pAu' });
  expect(results.data.map((invoice) => invoice.invoiceNumber)).toContain(APPENDIX_A.invoiceNumber);
  for (const invoice of results.data) {
    expect(`${invoice.invoiceNumber} ${invoice.customer.fullname}`.toLowerCase()).toContain('pau');
  }
  await listPage.expectInvoices(results.data);
  const appendixRow = results.data.findIndex(
    (invoice) => invoice.invoiceNumber === APPENDIX_A.invoiceNumber,
  );
  const customers = await listPage.columnTexts('Customer name');
  expect(customers[appendixRow]).toContain(APPENDIX_A.customerName);

  // The URL is the source of truth: a reload shows the same search.
  const reloaded = await listPage.waitForResults({ keyword: 'pAu' }, () => page.reload());
  await expect(listPage.searchBox).toHaveValue('pAu');
  await listPage.expectInvoices(reloaded.data);
});

test('filters by status, Overdue and Paid included', async ({ listPage }) => {
  await listPage.goto();

  for (const status of ['Overdue', 'Paid'] as const) {
    const results = await listPage.waitForResults({ status }, () =>
      listPage.statusSelect.selectOption(status),
    );
    expect(results.data.length, `seeded ${status} invoices`).toBeGreaterThan(0);
    expect(new Set(results.data.map((invoice) => invoice.status))).toEqual(new Set([status]));

    await listPage.expectQuery({ status });
    await listPage.expectInvoices(results.data);
    expect(await listPage.columnTexts('Status')).toEqual(results.data.map(() => status));
  }
});

test('sorts by total amount in both directions', async ({ listPage }) => {
  await listPage.goto();

  const descending = await listPage.waitForResults(
    { sortBy: 'totalAmount', ordering: 'DESC' },
    () => listPage.sortBySelect.selectOption({ label: 'Total amount' }),
  );
  expect(isNonDecreasing(descending.data.map((invoice) => invoice.totalAmount).reverse())).toBe(
    true,
  );

  const ascending = await listPage.waitForResults({ sortBy: 'totalAmount', ordering: 'ASC' }, () =>
    listPage.ascendingButton.click(),
  );
  await listPage.expectQuery({ sortBy: 'totalAmount', ordering: 'ASC' });
  await listPage.expectInvoices(ascending.data);

  const shownTotals = (await listPage.columnTexts('Total amount')).map(parseMoney);
  expect(shownTotals).toEqual(ascending.data.map((invoice) => invoice.totalAmount));
  expect(isNonDecreasing(shownTotals), `ascending totals: ${shownTotals.join(', ')}`).toBe(true);

  await expect(listPage.ascendingButton).toHaveAttribute('aria-pressed', 'true');
  await expect(listPage.descendingButton).toHaveAttribute('aria-pressed', 'false');
  await expect(listPage.table.getByRole('columnheader', { name: 'Total amount' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
});

test('pages through the results with the chosen page size', async ({ listPage }) => {
  // Oldest first: invoices other tests create meanwhile are dated today, so they land on the last
  // page instead of shifting pages 1 and 2 between two requests. 20 rows per page first, so that
  // choosing 10 is a real change.
  const twenty = await listPage.goto('?ordering=ASC&pageSize=20');
  expect(twenty.paging.total, 'enough seeded invoices for two pages of 10').toBeGreaterThan(20);
  await listPage.expectInvoices(twenty.data);
  expect(twenty.data).toHaveLength(20);

  const pageOne = await listPage.waitForResults(
    { pageSize: '10', page: '1', ordering: 'ASC' },
    () => listPage.rowsPerPageSelect.selectOption('10'),
  );
  await listPage.expectQuery({ ordering: 'ASC' });
  await listPage.expectInvoices(pageOne.data);
  expect(pageOne.data).toHaveLength(10);
  await expect(listPage.pageIndicator).toHaveText(`Page 1 of ${pageOne.paging.totalPages}`);

  const pageTwo = await listPage.waitForResults(
    { pageSize: '10', page: '2', ordering: 'ASC' },
    () => listPage.nextPageButton.click(),
  );
  await listPage.expectQuery({ ordering: 'ASC', page: '2' });
  await listPage.expectInvoices(pageTwo.data);
  expect(pageTwo.data).toHaveLength(10);
  await expect(listPage.pageIndicator).toHaveText(`Page 2 of ${pageTwo.paging.totalPages}`);
  await expect(listPage.resultSummary).toHaveText(
    listPage.summaryText(11, 20, pageTwo.paging.total),
  );
  // Page 2 continues where page 1 stopped: the 20-row page is exactly both pages of 10.
  expect([...pageOne.data, ...pageTwo.data].map((invoice) => invoice.invoiceId)).toEqual(
    twenty.data.map((invoice) => invoice.invoiceId),
  );

  // Back to page 1: served from the query cache, so no request to wait for.
  await listPage.previousPageButton.click();
  await listPage.expectQuery({ ordering: 'ASC' });
  await expect(listPage.pageIndicator).toHaveText(`Page 1 of ${pageOne.paging.totalPages}`);
  await listPage.expectInvoices(pageOne.data);
});

test('shows only invoices issued within the date range', async ({ listPage }) => {
  await listPage.goto();

  await listPage.fromDate.fill('2026-06-01');
  const june = await listPage.waitForResults({ fromDate: '2026-06-01', toDate: '2026-06-30' }, () =>
    listPage.toDate.fill('2026-06-30'),
  );
  await listPage.expectQuery({ fromDate: '2026-06-01', toDate: '2026-06-30' });
  expect(june.data.map((invoice) => invoice.invoiceNumber)).toContain(APPENDIX_A.invoiceNumber);
  for (const invoice of june.data) {
    expect(invoice.invoiceDate >= '2026-06-01' && invoice.invoiceDate <= '2026-06-30').toBe(true);
  }
  await listPage.expectInvoices(june.data);
  for (const shownDate of await listPage.columnTexts('Invoice date')) {
    expect(shownDate).toMatch(/^\d{1,2} Jun 2026$/);
  }
});

test('treats both ends of the date range as inclusive and refuses an inverted range', async ({
  page,
  listPage,
}) => {
  const requestedRanges: string[] = [];
  page.on('request', (request) => {
    if (!isApiCall('GET', '/api/invoices')(request)) return;
    const { searchParams } = new URL(request.url());
    requestedRanges.push(`${searchParams.get('fromDate')}..${searchParams.get('toDate')}`);
  });
  await listPage.goto(`?keyword=${APPENDIX_A.invoiceNumber}`);

  // A single-day range on the invoice date still includes it.
  await listPage.fromDate.fill(APPENDIX_A.invoiceDate);
  const sameDay = await listPage.waitForResults(
    { fromDate: APPENDIX_A.invoiceDate, toDate: APPENDIX_A.invoiceDate },
    () => listPage.toDate.fill(APPENDIX_A.invoiceDate),
  );
  expect(sameDay.data.map((invoice) => invoice.invoiceNumber)).toEqual([APPENDIX_A.invoiceNumber]);
  await listPage.expectInvoices(sameDay.data);
  expect(await listPage.columnTexts('Invoice date')).toEqual([APPENDIX_A.invoiceDateText]);

  // From after To: an inline error instead of a request the API would reject.
  await listPage.fromDate.fill('2026-06-04');
  await expect(listPage.toDate).toHaveAccessibleDescription('Must be on or after the From date');

  // Fixing the range applies it; the day after the invoice date excludes it.
  const later = await listPage.waitForResults(
    { fromDate: '2026-06-04', toDate: '2026-06-30' },
    () => listPage.toDate.fill('2026-06-30'),
  );
  expect(later.data).toEqual([]);
  await expect(listPage.noMatchesHeading).toBeVisible();
  await expect(listPage.toDate).not.toHaveAccessibleDescription(
    'Must be on or after the From date',
  );
  expect(requestedRanges).not.toContain('2026-06-04..2026-06-03');
});

test('resets every filter at once and keeps the sort order', async ({ listPage }) => {
  const filtered = await listPage.goto(
    '?sortBy=totalAmount&status=Overdue&keyword=pAu&fromDate=2026-01-01&toDate=2026-12-31',
  );
  expect(filtered.data.map((invoice) => invoice.invoiceNumber)).toContain(APPENDIX_A.invoiceNumber);
  await expect(listPage.searchBox).toHaveValue('pAu');
  await expect(listPage.statusSelect).toHaveValue('Overdue');
  await expect(listPage.fromDate).toHaveValue('2026-01-01');

  const reset = await listPage.waitForResults(
    { sortBy: 'totalAmount', status: null, keyword: null, fromDate: null, toDate: null },
    () => listPage.resetFiltersButton.click(),
  );
  await listPage.expectQuery({ sortBy: 'totalAmount' });
  await listPage.expectInvoices(reset.data);
  await expect(listPage.searchBox).toHaveValue('');
  await expect(listPage.statusSelect).toHaveValue('');
  await expect(listPage.fromDate).toHaveValue('');
  await expect(listPage.toDate).toHaveValue('');
  await expect(listPage.sortBySelect).toHaveValue('totalAmount');
  await expect(listPage.resetFiltersButton).toBeHidden();
});

test('shows an empty state for a keyword that matches nothing and clears it', async ({
  listPage,
}) => {
  // Oldest first: invoices other tests create meanwhile land on the last page, so the first page
  // stays the same whether it comes back from the query cache or from a fresh request.
  const firstPage = await listPage.goto('?ordering=ASC');
  const keyword = `zz-no-match-${randomBytes(4).toString('hex')}`;

  const results = await listPage.search(keyword);
  expect(results.data).toEqual([]);
  expect(results.paging.total).toBe(0);
  await expect(listPage.noMatchesHeading).toBeVisible();
  await expect(listPage.table).toBeHidden();

  // Clearing keeps the sort order and returns to the first page.
  await listPage.clearFiltersButton.click();
  await listPage.expectQuery({ ordering: 'ASC' });
  await expect(listPage.searchBox).toHaveValue('');
  await listPage.expectInvoices(firstPage.data);
});

test('restores the filters with the browser back and forward buttons', async ({
  page,
  listPage,
}) => {
  // Oldest first, so the unfiltered page is the same whether it is served from the query cache or
  // fetched again (invoices other tests create meanwhile land on the last page).
  const firstPage = await listPage.goto('?ordering=ASC');

  const overdue = await listPage.waitForResults({ status: 'Overdue' }, () =>
    listPage.statusSelect.selectOption('Overdue'),
  );
  await listPage.expectInvoices(overdue.data);
  // Typing replaces the current history entry (Back must not replay keystrokes)…
  const overdueForPaul = await listPage.search('pAu');
  await listPage.expectInvoices(overdueForPaul.data);
  // …while picking a status adds one.
  const paidForPaul = await listPage.waitForResults({ status: 'Paid', keyword: 'pAu' }, () =>
    listPage.statusSelect.selectOption('Paid'),
  );
  expect(paidForPaul.data).toEqual([]);
  await expect(listPage.noMatchesHeading).toBeVisible();

  await page.goBack();
  await listPage.expectQuery({ ordering: 'ASC', status: 'Overdue', keyword: 'pAu' });
  await expect(listPage.statusSelect).toHaveValue('Overdue');
  await expect(listPage.searchBox).toHaveValue('pAu');
  await listPage.expectInvoices(overdueForPaul.data);

  await page.goBack();
  await listPage.expectQuery({ ordering: 'ASC' });
  await expect(listPage.statusSelect).toHaveValue('');
  await expect(listPage.searchBox).toHaveValue('');
  await listPage.expectInvoices(firstPage.data);

  await page.goForward();
  await listPage.expectQuery({ ordering: 'ASC', status: 'Overdue', keyword: 'pAu' });
  await expect(listPage.statusSelect).toHaveValue('Overdue');
  await expect(listPage.searchBox).toHaveValue('pAu');
  await listPage.expectInvoices(overdueForPaul.data);
});
