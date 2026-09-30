import type { Locator, Page } from '@playwright/test';

export class InvoiceDetailPage {
  readonly page: Page;
  readonly backLink: Locator;
  readonly notFoundHeading: Locator;
  readonly detailsRegion: Locator;
  readonly lineItemsRegion: Locator;
  readonly summaryRegion: Locator;
  readonly customerRegion: Locator;

  constructor(page: Page) {
    this.page = page;
    this.backLink = page.getByRole('link', { name: 'Back to invoices' });
    this.notFoundHeading = page.getByRole('heading', { level: 1, name: 'Invoice not found' });
    this.detailsRegion = page.getByRole('region', { name: 'Invoice details', exact: true });
    this.lineItemsRegion = page.getByRole('region', { name: 'Line items', exact: true });
    this.summaryRegion = page.getByRole('region', { name: 'Summary', exact: true });
    this.customerRegion = page.getByRole('region', { name: 'Customer', exact: true });
  }

  /** The page title, which also carries the status badge ("Invoice INV-1 Overdue"). */
  heading(invoiceNumber: string): Locator {
    return this.page.getByRole('heading', { level: 1, name: `Invoice ${invoiceNumber}` });
  }

  lineItem(name: string): Locator {
    return this.lineItemsRegion
      .getByRole('row')
      .filter({ has: this.page.getByRole('rowheader', { name, exact: true }) });
  }

  /** A description list as { term: definition }, e.g. { Subtotal: 'AU$2,000.00', … }. */
  async readTerms(region: Locator): Promise<Record<string, string>> {
    const terms = await region.getByRole('term').allInnerTexts();
    const definitions = await region.getByRole('definition').allInnerTexts();
    return Object.fromEntries(
      terms.map((term, index) => [term.trim(), definitions[index]?.trim() ?? '']),
    );
  }
}
