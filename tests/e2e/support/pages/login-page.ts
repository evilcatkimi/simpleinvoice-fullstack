import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { isApiCall } from '../http';

export class LoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly alert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Sign in to SimpleInvoice' });
    this.email = page.getByLabel('Email', { exact: true });
    this.password = page.getByLabel('Password', { exact: true });
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
    this.alert = page.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
    await this.expectVisible();
  }

  async expectVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login$/);
    await expect(this.heading).toBeVisible();
  }

  /** Submits the form and resolves with the API's answer to POST /auth/login. */
  async signIn(credentials: { email: string; password: string }): Promise<Response> {
    await this.email.fill(credentials.email);
    await this.password.fill(credentials.password);
    const response = this.page.waitForResponse(isApiCall('POST', '/api/auth/login'));
    await this.signInButton.click();
    return response;
  }
}
