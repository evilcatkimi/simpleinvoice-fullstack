import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, parsePath, RouterProvider } from 'react-router';
import { AppProviders } from '@/bootstrap/providers';
import { routes } from '@/bootstrap/route-table';
import { createQueryClient } from '@/core/api/query-client';
import { fakeApi } from './fake-api';
import { DEMO_USER } from './fixtures';

interface RenderAppOptions {
  /** Whether the mock API considers the session cookie valid. Defaults to true. */
  signedIn?: boolean;
  /** Router state of the initial entry (e.g. the list query string for "Back to invoices"). */
  state?: unknown;
}

/**
 * Renders the real application (routes, guards, providers) at `path` against the mock API, so
 * tests follow the same paths a user would.
 */
export function renderApp(path: string, { signedIn = true, state }: RenderAppOptions = {}) {
  fakeApi.currentUser = signedIn ? DEMO_USER : null;
  // No retries: a failing request should surface immediately in tests.
  const queryClient = createQueryClient({ queries: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [{ ...parsePath(path), state }] });
  const user = userEvent.setup();

  const view = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  /** Current URL of the in-memory router, e.g. "/invoices?status=Paid". */
  const currentUrl = () => `${router.state.location.pathname}${router.state.location.search}`;

  return { ...view, user, router, queryClient, currentUrl };
}
