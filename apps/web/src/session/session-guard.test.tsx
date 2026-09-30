import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiErrorResponse, fakeApi } from '@/test-support/fake-api';
import { DEMO_USER, TEST_PASSWORD } from '@/test-support/fixtures';
import { server } from '@/test-support/msw-server';
import { renderApp } from '@/test-support/render-app';

async function signIn(user: UserEvent) {
  await user.type(await screen.findByRole('textbox', { name: 'Email' }), DEMO_USER.email);
  await user.type(screen.getByLabelText('Password'), TEST_PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** Everything still cached, as [queryKey, data] pairs. */
function cachedQueries(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .getAll()
    .map((query) => [query.queryKey, query.state.data]);
}

describe('SessionGuard', () => {
  it('sends anonymous visitors to the login screen, then back where they were going', async () => {
    const { user, currentUrl } = renderApp('/invoices?status=Paid&page=2', { signedIn: false });

    await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });
    expect(currentUrl()).toBe('/login');

    await signIn(user);

    await screen.findByRole('heading', { name: 'Invoices', level: 1 });
    expect(currentUrl()).toBe('/invoices?status=Paid&page=2');
  });

  it('never redirects outside the app after login (open-redirect guard)', async () => {
    const { user, currentUrl } = renderApp('/login', {
      signedIn: false,
      state: { from: '//evil.example/phishing' },
    });

    await signIn(user);

    await screen.findByRole('heading', { name: 'Invoices', level: 1 });
    expect(currentUrl()).toBe('/invoices');
  });

  it('ends the session on a 401 and resumes after signing in again', async () => {
    const { user, currentUrl } = renderApp('/invoices');
    await screen.findByRole('table', { name: 'Invoices' });

    fakeApi.currentUser = null; // the cookie expired server-side
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(
      await screen.findByText('Your session has expired. Please sign in again.'),
    ).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });
    expect(currentUrl()).toBe('/login');

    await signIn(user);

    await waitFor(() => expect(currentUrl()).toBe('/invoices?page=2'));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('signs out through the header', async () => {
    const { user, currentUrl } = renderApp('/invoices');
    await screen.findByRole('table', { name: 'Invoices' });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });
    expect(currentUrl()).toBe('/login');
    expect(fakeApi.currentUser).toBeNull();
  });

  it('offers a retry, with the request reference, when the session check fails', async () => {
    server.use(
      http.get(
        '/api/auth/me',
        () => apiErrorResponse(500, 'Internal server error', 'Internal Server Error'),
        { once: true },
      ),
    );
    const { user } = renderApp('/invoices');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't verify your session");
    expect(alert).toHaveTextContent('Reference: req-test-123');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Invoices', level: 1 })).toBeInTheDocument();
  });

  it('does not tell anonymous visitors that their session expired', async () => {
    renderApp('/invoices', { signedIn: false });

    await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });

    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
  });

  it('forgets every invoice of the ended session after a 401', async () => {
    const { user, queryClient } = renderApp('/invoices');
    await screen.findByRole('table', { name: 'Invoices' });

    fakeApi.currentUser = null;
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });

    // Only the "anonymous" marker is left: the next person at this browser sees nothing of the last session.
    expect(cachedQueries(queryClient)).toEqual([[['auth', 'current-user'], null]]);
  });

  it('forgets every invoice of the session on sign out', async () => {
    const { user, queryClient } = renderApp('/invoices');
    await screen.findByRole('table', { name: 'Invoices' });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });

    expect(cachedQueries(queryClient)).toEqual([[['auth', 'current-user'], null]]);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });

  it('keeps the user signed in and explains when signing out fails', async () => {
    server.use(
      http.post('/api/auth/logout', () =>
        apiErrorResponse(500, 'Internal server error', 'Internal Server Error'),
      ),
    );
    const { user, currentUrl } = renderApp('/invoices');
    await screen.findByRole('table', { name: 'Invoices' });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Sign out failed. Please try again.')).toBeInTheDocument();
    expect(currentUrl()).toBe('/invoices');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});
