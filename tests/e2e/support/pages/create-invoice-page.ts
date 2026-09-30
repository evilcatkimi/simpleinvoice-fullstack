import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { isApiCall } from '../http';
import type { NewInvoice } from '../invoices';

export class CreateInvoicePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly customerName: Locator;
  readonly customerEmail: Locator;
  readonly invoiceNumber: Locator;
  readonly invoiceDate: Locator;
  readonly dueDate: Locator;
  readonly itemName: Locator;
  readonly quantity: Locator;
  readonly rate: Locator;
  readonly taxRate: Locator;
  readonly discount: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'New invoice' });
    const field = (label: string) => page.getByLabel(label, { exact: true });
    this.customerName = field('Customer name');
    this.customerEmail = field('Customer email');
    this.invoiceNumber = field('Invoice number');
    this.invoiceDate = field('Invoice date');
    this.dueDate = field('Due date');
    this.itemName = field('Item name');
    this.quantity = field('Quantity');
    this.rate = field('Rate');
    this.taxRate = field('Tax rate (%)');
    this.discount = field('Discount');
    this.submitButton = page.getByRole('button', { name: 'Create invoice' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/invoices/new');
    await expect(this.heading).toBeVisible();
  }

  /** Fills every field of `invoice`; dates and currency keep their defaults (today, +30 days, AUD). */
  async fillForm(invoice: NewInvoice): Promise<void> {
    await this.customerName.fill(invoice.customerName);
    await this.customerEmail.fill(invoice.customerEmail);
    await this.invoiceNumber.fill(invoice.invoiceNumber);
    await this.itemName.fill(invoice.itemName);
    await this.quantity.fill(invoice.quantity);
    await this.rate.fill(invoice.rate);
    await this.taxRate.fill(invoice.taxRate);
    await this.discount.fill(invoice.discount);
  }

  /** Clicks "Create invoice" and resolves with the API's answer to POST /invoices. */
  async submit(): Promise<Response> {
    const response = this.page.waitForResponse(isApiCall('POST', '/api/invoices'));
    await this.submitButton.click();
    return response;
  }

  /** A field shows `message` as its error: announced as its description and marked invalid. */
  async expectFieldError(field: Locator, message: string): Promise<void> {
    await expect(field).toHaveAccessibleDescription(message);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
  }
}
