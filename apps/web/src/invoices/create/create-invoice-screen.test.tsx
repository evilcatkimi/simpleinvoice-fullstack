import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorResponse, fakeApi } from '@/test-support/fake-api';
import { APPENDIX_A_INVOICE } from '@/test-support/fixtures';
import { server } from '@/test-support/msw-server';
import { renderApp } from '@/test-support/render-app';

const textbox = (name: string) => screen.getByRole('textbox', { name });

async function renderCreateScreen() {
  const view = renderApp('/invoices/new');
  await screen.findByRole('heading', { name: 'New invoice', level: 1 });
  return view;
}

async function fillRequiredFields(user: UserEvent, invoiceNumber = 'INV-2026-0100') {
  await user.type(textbox('Customer name'), '  Jane Doe ');
  await user.type(textbox('Customer email'), 'jane@example.com');
  await user.type(textbox('Invoice number'), invoiceNumber);
  await user.type(textbox('Item name'), 'Consulting');
  await user.clear(textbox('Quantity'));
  await user.type(textbox('Quantity'), '2');
  await user.type(textbox('Rate'), '150.50');
}

describe('CreateInvoiceScreen', () => {
  beforeEach(() => {
    // Only Date is faked: "today" is fixed while timers, user-event and MSW keep running normally.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 29, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pre-fills dates, currency, tax and discount', async () => {
    await renderCreateScreen();

    expect(screen.getByLabelText('Invoice date')).toHaveValue('2026-09-29');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-10-29');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue('AUD');
    expect(textbox('Tax rate (%)')).toHaveValue('10');
    expect(textbox('Discount')).toHaveValue('0');
    expect(
      screen.getByText('Totals are calculated by the server when the invoice is saved.'),
    ).toBeInTheDocument();
  });

  it('lists currencies from the API', async () => {
    await renderCreateScreen();

    const currency = screen.getByRole('combobox', { name: 'Currency' });
    await waitFor(() =>
      expect(
        within(currency)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        'AUD — Australian Dollar (AU$)',
        'USD — US Dollar (US$)',
        'SGD — Singapore Dollar (S$)',
      ]),
    );
  });

  it('flags every missing required field and focuses the first one', async () => {
    const { user } = await renderCreateScreen();

    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    expect(await screen.findByText('Customer name is required')).toBeInTheDocument();
    for (const message of [
      'Customer email is required',
      'Invoice number is required',
      'Item name is required',
      'Rate is required',
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
    expect(textbox('Customer name')).toHaveFocus();
    expect(textbox('Customer name')).toHaveAccessibleDescription('Customer name is required');
    expect(fakeApi.createRequests).toHaveLength(0);
  });

  it('rejects a due date before the invoice date', async () => {
    const { user } = await renderCreateScreen();

    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-09-28' } });
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    expect(
      await screen.findByText('Due date must be on or after the invoice date'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Due date')).toHaveAttribute('aria-invalid', 'true');
  });

  it('posts exactly the contract payload, then confirms and returns to the list', async () => {
    const { user, currentUrl } = await renderCreateScreen();

    await fillRequiredFields(user);
    await user.type(textbox('Description'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    expect(await screen.findByText('Invoice INV-2026-0100 created')).toBeInTheDocument();
    await waitFor(() => expect(currentUrl()).toBe('/invoices'));
    // No totals, status or currencySymbol, trimmed strings, blank optional fields omitted.
    expect(fakeApi.createRequests).toEqual([
      {
        invoiceNumber: 'INV-2026-0100',
        invoiceDate: '2026-09-29',
        dueDate: '2026-10-29',
        currency: 'AUD',
        customer: { fullname: 'Jane Doe', email: 'jane@example.com' },
        items: [{ name: 'Consulting', quantity: 2, rate: 150.5 }],
        taxRate: 10,
        discount: 0,
      },
    ]);
    // The refreshed list shows the new invoice first (newest invoice date).
    const table = await screen.findByRole('table', { name: 'Invoices' });
    expect(await within(table).findByRole('link', { name: 'INV-2026-0100' })).toBeInTheDocument();
  });

  it('shows the new invoice in the very first list render after creating it', async () => {
    const { user } = renderApp('/invoices');
    // The list is cached before the invoice exists.
    await screen.findByRole('table', { name: 'Invoices' });
    await user.click(screen.getByRole('link', { name: 'New invoice' }));
    await screen.findByRole('heading', { name: 'New invoice', level: 1 });

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    // No stale cached page shows up first: the list comes back already containing the invoice.
    const table = await screen.findByRole('table', { name: 'Invoices' });
    expect(within(table).getByRole('link', { name: 'INV-2026-0100' })).toBeInTheDocument();
  });

  it('forgets the invoice it was saving when the session ends with a 401', async () => {
    const { user, queryClient } = await renderCreateScreen();
    await fillRequiredFields(user);

    fakeApi.currentUser = null; // the session expired while the form was open
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });
    // The customer's details were the variables of the create mutation.
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });

  it('points at the invoice number when it is already taken', async () => {
    const { user, currentUrl } = await renderCreateScreen();

    await fillRequiredFields(user, APPENDIX_A_INVOICE.invoiceNumber);
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    expect(await screen.findByText('Invoice number already exists')).toBeInTheDocument();
    expect(textbox('Invoice number')).toHaveFocus();
    expect(textbox('Invoice number')).toHaveAttribute('aria-invalid', 'true');
    expect(currentUrl()).toBe('/invoices/new');
  });

  it.each([
    ['one message', ['discount must not exceed subtotal plus tax']],
    [
      'several messages',
      ['dueDate must be on or after invoiceDate', 'items.0.rate must be a positive number'],
    ],
    ['a repeated message', ['rate must be a positive number', 'rate must be a positive number']],
  ])('shows the validation errors the server returns (%s)', async (_, messages) => {
    const consoleError = vi.spyOn(console, 'error');
    server.use(http.post('/api/invoices', () => apiErrorResponse(400, messages, 'Bad Request')));
    const { user } = await renderCreateScreen();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The invoice could not be created');
    expect(
      within(alert)
        .getAllByText(/must/)
        .map((message) => message.textContent),
    ).toEqual(messages);
    await waitFor(() => expect(alert).toHaveFocus());
    // React reports duplicate list keys there: each message must render exactly once.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the form filled in and explains when the server cannot be reached', async () => {
    server.use(http.post('/api/invoices', () => HttpResponse.error()));
    const { user, currentUrl } = await renderCreateScreen();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to reach the server/i);
    expect(currentUrl()).toBe('/invoices/new');
    expect(textbox('Invoice number')).toHaveValue('INV-2026-0100');
  });

  it.each([
    ['a network error', () => HttpResponse.error()],
    [
      'a server error',
      () => apiErrorResponse(500, 'Internal server error', 'Internal Server Error'),
    ],
  ])('still offers every supported currency after %s on the currency list', async (_, respond) => {
    let answered = false;
    server.use(
      http.get('/api/currencies', () => {
        answered = true;
        return respond();
      }),
    );
    await renderCreateScreen();
    await waitFor(() => expect(answered).toBe(true));

    const currency = screen.getByRole('combobox', { name: 'Currency' });
    expect(
      within(currency)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['AUD', 'USD', 'GBP', 'EUR', 'SGD', 'NZD', 'CAD', 'VND']);
    expect(currency).toHaveValue('AUD');
  });

  it('cancels back to the list view it was opened from', async () => {
    renderApp('/invoices/new', { state: { listSearch: '?status=Paid&page=2' } });

    expect(await screen.findByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/invoices?status=Paid&page=2',
    );
  });

  it('cannot be submitted twice while saving', async () => {
    let requests = 0;
    server.use(
      http.post('/api/invoices', async () => {
        requests += 1;
        await delay(150);
        return HttpResponse.json(
          { ...APPENDIX_A_INVOICE, invoiceNumber: 'INV-2026-0100' },
          { status: 201 },
        );
      }),
    );
    const { user } = await renderCreateScreen();
    await fillRequiredFields(user);

    const submit = screen.getByRole('button', { name: 'Create invoice' });
    await user.click(submit);
    expect(submit).toBeDisabled();
    await user.click(submit);

    expect(await screen.findByText('Invoice INV-2026-0100 created')).toBeInTheDocument();
    expect(requests).toBe(1);
  });
});
