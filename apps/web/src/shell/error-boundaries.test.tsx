import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPENDIX_A_INVOICE } from '@/test-support/fixtures';
import { server } from '@/test-support/msw-server';
import { renderApp } from '@/test-support/render-app';
import { CrashScreen } from './error-boundaries';

function BrokenScreen(): never {
  throw new Error('Cannot read properties of undefined (reading "customer")');
}

beforeEach(() => {
  // React and the router report the error on the console; that noise is expected here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('CrashScreen', () => {
  it('replaces a page that crashed while rendering with a way out, not a blank page', async () => {
    const router = createMemoryRouter([
      { ErrorBoundary: CrashScreen, children: [{ index: true, Component: BrokenScreen }] },
    ]);

    render(<RouterProvider router={router} />);

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    // Internals stay out of the UI.
    expect(alert).not.toHaveTextContent('Cannot read properties');
  });
});

describe('CrashPanel', () => {
  it('keeps the header and Sign out when a screen crashes, and recovers on navigation', async () => {
    // A response the screen cannot render (no customer) stands in for a rendering bug.
    server.use(
      http.get('/api/invoices/:invoiceId', () =>
        HttpResponse.json({ ...APPENDIX_A_INVOICE, customer: null }),
      ),
    );
    const { user } = renderApp(`/invoices/${APPENDIX_A_INVOICE.invoiceId}`);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(within(screen.getByRole('main')).getByRole('alert')).toBe(alert);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link'));

    expect(await screen.findByRole('heading', { name: 'Invoices', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
