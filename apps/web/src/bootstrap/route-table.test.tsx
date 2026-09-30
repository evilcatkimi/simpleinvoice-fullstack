import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test-support/render-app';

describe('routes', () => {
  it('makes the invoice list the home screen', async () => {
    const { currentUrl } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Invoices', level: 1 })).toBeInTheDocument();
    expect(currentUrl()).toBe('/invoices');
    // The title is set in an effect, which may run just after the heading is committed.
    await waitFor(() => expect(document.title).toBe('Invoices · SimpleInvoice'));
  });

  it('shows a 404 screen for unknown URLs', async () => {
    renderApp('/does-not-exist');

    expect(
      await screen.findByRole('heading', { name: 'Page not found', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to invoices' })).toHaveAttribute(
      'href',
      '/invoices',
    );
  });
});
