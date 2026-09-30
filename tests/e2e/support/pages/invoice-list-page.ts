import { expect, type Locator, type Page } from '@playwright/test';
import { type InvoicePage, readInvoicePage, waitForInvoiceList } from '../invoices';

type Column =
  'Invoice number' | 'Customer name' | 'Invoice date' | 'Due date' | 'Total amount' | 'Status';

/** Tailwind's `md` breakpoint, where the SPA switches from cards to the table. */
const TABLE_MIN_WIDTH = 768;

export class InvoiceListPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newInvoiceLink: Locator;
  readonly searchBox: Locator;
  readonly statusSelect: Locator;
  readonly sortBySelect: Locator;
  readonly ascendingButton: Locator;
  readonly descendingButton: Locator;
  readonly fromDate: Locator;
  readonly toDate: Locator;
  readonly resetFiltersButton: Locator;
  readonly rowsPerPageSelect: Locator;
  readonly previousPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly pageIndicator: Locator;
  readonly resultSummary: Locator;
  readonly table: Locator;
  readonly cardList: Locator;
  readonly noMatchesHeading: Locator;
  readonly clearFiltersButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Invoices', exact: true });
    this.newInvoiceLink = page.getByRole('link', { name: 'New invoice' });
    this.searchBox = page.getByRole('searchbox', { name: 'Search invoices' });
    this.statusSelect = page.getByRole('combobox', { name: 'Status', exact: true });
    this.sortBySelect = page.getByRole('combobox', { name: 'Sort by', exact: true });
    const order = page.getByRole('group', { name: 'Order' });
    this.ascendingButton = order.getByRole('button', { name: 'Ascending' });
    this.descendingButton = order.getByRole('button', { name: 'Descending' });
    this.fromDate = page.getByLabel('From date', { exact: true });
    this.toDate = page.getByLabel('To date', { exact: true });
    this.resetFiltersButton = page.getByRole('button', { name: 'Reset filters' });
    this.rowsPerPageSelect = page.getByRole('combobox', { name: 'Rows per page' });
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    this.previousPageButton = pagination.getByRole('button', { name: 'Previous page' });
    this.nextPageButton = pagination.getByRole('button', { name: 'Next page' });
    this.pageIndicator = pagination.getByText(/^Page \d+ of \d+$/);
    this.resultSummary = page.getByText(/^Showing \d+–\d+ of \d+ invoices?$/);
    this.table = page.getByRole('table', { name: 'Invoices' });
    this.cardList = page.getByRole('list', { name: 'Invoices' });
    this.noMatchesHeading = page.getByRole('heading', { name: 'No invoices match your filters' });
    this.clearFiltersButton = page.getByRole('button', { name: 'Clear filters' });
  }

  /** The visible result summary: "Showing 11–20 of 41 invoices", or "… of 1 invoice". */
  summaryText(first: number, last: number, total: number): string {
    return `Showing ${first}–${last} of ${total} ${total === 1 ? 'invoice' : 'invoices'}`;
  }

  /** Opens the list (optionally with a query string) and resolves with its first result page. */
  async goto(search = ''): Promise<InvoicePage> {
    const results = await this.waitForResults({}, () => this.page.goto(`/invoices${search}`));
    await expect(this.heading).toBeVisible();
    return results;
  }

  /**
   * Runs `action` and resolves with the invoice list the API returned for the request it
   * triggered, matched on `query` (see waitForInvoiceList). Proves the UI change reached the API.
   */
  async waitForResults(
    query: Record<string, string | null>,
    action: () => Promise<unknown>,
  ): Promise<InvoicePage> {
    const response = waitForInvoiceList(this.page, query);
    await action();
    return readInvoicePage(await response);
  }

  /** The list state in the address bar is exactly `expected` (defaults are left out of the URL). */
  async expectQuery(expected: Record<string, string>): Promise<void> {
    await expect(this.page).toHaveURL(/\/invoices(\?|$)/);
    await expect
      .poll(() => Object.fromEntries(new URL(this.page.url()).searchParams))
      .toEqual(expected);
  }

  /** Types into the (debounced) search box and resolves with the matching results. */
  async search(keyword: string): Promise<InvoicePage> {
    return this.waitForResults({ keyword }, () => this.searchBox.fill(keyword));
  }

  /** Invoice-number links in display order: table rows on wide screens, cards on phones. */
  invoiceLinks(): Locator {
    const width = this.page.viewportSize()?.width ?? TABLE_MIN_WIDTH;
    return width >= TABLE_MIN_WIDTH
      ? this.table.getByRole('rowheader').getByRole('link')
      : this.cardList.getByRole('listitem').getByRole('link');
  }

  invoiceLink(invoiceNumber: string): Locator {
    return this.invoiceLinks().filter({ hasText: invoiceNumber });
  }

  /** Waits until exactly these invoices are on screen, in this order (stale rows fail it). */
  async expectInvoices(invoices: readonly { invoiceNumber: string }[]): Promise<void> {
    await expect(this.invoiceLinks()).toHaveText(invoices.map((invoice) => invoice.invoiceNumber));
  }

  /** One table column, top to bottom. Call it once `expectInvoices` has settled the rows. */
  async columnTexts(column: Column): Promise<string[]> {
    const headers = (await this.table.getByRole('columnheader').allTextContents()).map((text) =>
      text.trim(),
    );
    const index = headers.indexOf(column);
    if (index < 0) throw new Error(`No "${column}" column among: ${headers.join(', ')}`);
    // The first column is the row header (the invoice number); the others are plain cells.
    if (index === 0) return this.table.getByRole('rowheader').allInnerTexts();
    const cells = await this.table.getByRole('cell').allInnerTexts();
    const cellsPerRow = headers.length - 1;
    return cells
      .filter((_, cellIndex) => cellIndex % cellsPerRow === index - 1)
      .map((text) => text.trim());
  }
}
