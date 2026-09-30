import { screen, waitFor } from '@testing-library/react';
import { delay, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiErrorResponse } from '@/test-support/fake-api';
import { DEMO_USER, TEST_PASSWORD } from '@/test-support/fixtures';
import { server } from '@/test-support/msw-server';
import { renderApp } from '@/test-support/render-app';

async function renderLoginScreen() {
  const view = renderApp('/login', { signedIn: false });
  await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });
  return view;
}

describe('LoginScreen', () => {
  it('validates the fields before calling the API', async () => {
    let loginCalls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/auth/login')) loginCalls += 1;
    });
    const { user } = await renderLoginScreen();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    const email = screen.getByRole('textbox', { name: 'Email' });
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Email is required');
    expect(email).toHaveFocus();

    await user.type(email, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(loginCalls).toBe(0);
  });

  it('signs in and lands on the invoice list', async () => {
    const { user, currentUrl } = await renderLoginScreen();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), ` ${DEMO_USER.email} `);
    await user.type(screen.getByLabelText('Password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Invoices', level: 1 })).toBeInTheDocument();
    expect(currentUrl()).toBe('/invoices');
    expect(screen.getByText(DEMO_USER.fullname)).toBeInTheDocument();
  });

  it('shows the server message for wrong credentials', async () => {
    const { user } = await renderLoginScreen();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), DEMO_USER.email);
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('explains when the login is rate limited', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        apiErrorResponse(429, 'Too many attempts, try again later', 'Too Many Requests'),
      ),
    );
    const { user } = await renderLoginScreen();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), DEMO_USER.email);
    await user.type(screen.getByLabelText('Password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait a few minutes and try again.',
    );
  });

  it('disables the submit button while the request is in flight', async () => {
    server.use(
      http.post('/api/auth/login', async () => {
        await delay(200);
        return apiErrorResponse(401, 'Invalid email or password', 'Unauthorized');
      }),
    );
    const { user } = await renderLoginScreen();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), DEMO_USER.email);
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
  });

  it('never keeps the access token from the response body', async () => {
    const { user, queryClient } = await renderLoginScreen();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), DEMO_USER.email);
    await user.type(screen.getByLabelText('Password'), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Invoices', level: 1 });

    const cachedState = JSON.stringify([
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data),
    ]);
    expect(cachedState).toContain(DEMO_USER.fullname);
    expect(cachedState).not.toContain('header.payload.signature');
  });

  it('keeps no password in memory once an attempt is over, failed or successful', async () => {
    const { user, queryClient } = await renderLoginScreen();
    // The login mutation's variables are the credentials.
    const cachedVariables = () =>
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      );
    const password = screen.getByLabelText('Password');

    await user.type(screen.getByRole('textbox', { name: 'Email' }), DEMO_USER.email);
    await user.type(password, 'Wrong-Password-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(cachedVariables()).not.toContain('Wrong-Password-1'));

    await user.clear(password);
    await user.type(password, TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Invoices', level: 1 });
    await waitFor(() => expect(cachedVariables()).not.toContain(TEST_PASSWORD));
  });

  it('sends users who are already signed in to the invoice list', async () => {
    const { currentUrl } = renderApp('/login');

    await screen.findByRole('heading', { name: 'Invoices', level: 1 });
    expect(currentUrl()).toBe('/invoices');
  });
});
