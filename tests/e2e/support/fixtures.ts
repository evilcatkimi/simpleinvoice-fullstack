import {
  type APIRequest,
  type APIRequestContext,
  test as base,
  type ConsoleMessage,
  expect,
} from '@playwright/test';
import { AppShell } from './pages/app-shell';
import { CreateInvoicePage } from './pages/create-invoice-page';
import { InvoiceDetailPage } from './pages/invoice-detail-page';
import { InvoiceListPage } from './pages/invoice-list-page';
import { LoginPage } from './pages/login-page';

/** How Chromium reports a blocked resource, inline script/style, eval or connection. */
const CSP_VIOLATION =
  /Content Security Policy|Refused to (load|execute|apply|connect|evaluate|frame)/i;

export class BrowserErrors {
  private cspViolations: string[] = [];
  readonly uncaughtErrors: string[] = [];

  record(message: ConsoleMessage): void {
    if (CSP_VIOLATION.test(message.text())) this.cspViolations.push(message.text());
  }

  /** Hands over the violations seen so far, for a test that provokes one on purpose. */
  takeCspViolations(): string[] {
    const violations = this.cspViolations;
    this.cspViolations = [];
    return violations;
  }
}

type RequestContextOptions = NonNullable<Parameters<APIRequest['newContext']>[0]>;

interface RequestFixtures {
  /** Opens an HTTP client that is disposed when the test ends, whether it passed or not. */
  newRequestContext: (options: RequestContextOptions) => Promise<APIRequestContext>;
}

/** For browserless tests: nothing here opens a page. */
export const apiTest = base.extend<RequestFixtures>({
  newRequestContext: async ({ playwright }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (options) => {
      const context = await playwright.request.newContext(options);
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },
});

interface Fixtures {
  browserErrors: BrowserErrors;
  loginPage: LoginPage;
  shell: AppShell;
  listPage: InvoiceListPage;
  detailPage: InvoiceDetailPage;
  createPage: CreateInvoicePage;
}

export const test = apiTest.extend<Fixtures>({
  // Runs for every browser test: a CSP violation or an uncaught error anywhere in a flow fails it.
  browserErrors: [
    async ({ page }, use) => {
      const errors = new BrowserErrors();
      page.on('console', (message) => errors.record(message));
      page.on('pageerror', (error) => errors.uncaughtErrors.push(error.message));
      await use(errors);
      expect(errors.takeCspViolations(), 'Content Security Policy violations').toEqual([]);
      expect(errors.uncaughtErrors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  shell: async ({ page }, use) => use(new AppShell(page)),
  listPage: async ({ page }, use) => use(new InvoiceListPage(page)),
  detailPage: async ({ page }, use) => use(new InvoiceDetailPage(page)),
  createPage: async ({ page }, use) => use(new CreateInvoicePage(page)),
});

export { expect };
