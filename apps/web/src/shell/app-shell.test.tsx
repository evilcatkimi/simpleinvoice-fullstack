import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APPENDIX_A_INVOICE } from '@/test-support/fixtures';
import { renderApp } from '@/test-support/render-app';

describe('AppShell', () => {
  it('moves focus to the new screen after in-app navigation, but not on the first render', async () => {
    // "/" redirects to the list: that is still the first render, not a navigation by the user.
    const { user } = renderApp('/');
    const table = await screen.findByRole('table', { name: 'Invoices' });
    expect(screen.getByRole('main')).not.toHaveFocus();

    await user.click(within(table).getByRole('link', { name: APPENDIX_A_INVOICE.invoiceNumber }));
    await screen.findByRole('heading', { level: 1, name: /Invoice IV1780488206995/ });

    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('leaves focus in the search box while the query string changes', async () => {
    const { user, currentUrl } = renderApp('/invoices');
    await screen.findByRole('table', { name: 'Invoices' });
    const search = screen.getByRole('searchbox', { name: 'Search invoices' });

    await user.type(search, 'paul');
    await waitFor(() => expect(currentUrl()).toBe('/invoices?keyword=paul'));

    expect(search).toHaveFocus();
  });
});
