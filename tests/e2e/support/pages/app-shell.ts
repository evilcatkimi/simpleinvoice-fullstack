import type { Locator, Page } from '@playwright/test';

/** Header shared by every signed-in screen. */
export class AppShell {
  readonly header: Locator;
  readonly signOutButton: Locator;

  constructor(page: Page) {
    this.header = page.getByRole('banner');
    this.signOutButton = this.header.getByRole('button', { name: 'Sign out' });
  }

  /** The user's name; wide screens show it, narrow ones keep it for screen readers only. */
  signedInUser(fullname: string): Locator {
    return this.header.getByText(fullname);
  }
}
