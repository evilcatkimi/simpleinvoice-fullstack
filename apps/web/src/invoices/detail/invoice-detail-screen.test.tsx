import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiErrorResponse, fakeApi } from '@/test-support/fake-api';
import { APPENDIX_A_INVOICE } from '@/test-support/fixtures';
import { server } from '@/test-support/msw-server';
import { renderApp } from '@/test-support/render-app';

/** Text of the <dd> that belongs to the <dt> labelled `term`. */
function definitionOf(container: HTMLElement, term: string): string | null | undefined {
  return within(container).getByText(term, { selector: 'dt' }).nextElementSibling?.textContent;
}

describe('InvoiceDetailScreen', () => {
  it('shows the invoice, customer, line item and every server-calculated amount', async () => {
    renderApp(`/invoices/${APPENDIX_A_INVOICE.invoiceId}`);

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Invoice IV1780488206995');
    expect(within(heading).getByText('Overdue')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Invoice IV1780488206995 · SimpleInvoice'));

    const details = screen.getByRole('region', { name: 'Invoice details' });
    expect(definitionOf(details, 'Reference')).toBe('#5721662');
    expect(definitionOf(details, 'Invoice date')).toBe('3 Jun 2026');
    expect(definitionOf(details, 'Due date')).toBe('3 Jul 2026');
    expect(definitionOf(details, 'Currency')).toBe('AUD (AU$)');
    expect(definitionOf(details, 'Description')).toBe('Invoice is issued to Kanglee');

    const customer = screen.getByRole('region', { name: 'Customer' });
    expect(definitionOf(customer, 'Name')).toBe('Paul');
    expect(within(customer).getByRole('link', { name: 'paul@101digital.io' })).toHaveAttribute(
      'href',
      'mailto:paul@101digital.io',
    );
    expect(definitionOf(customer, 'Mobile')).toBe('947717364111');
    expect(definitionOf(customer, 'Address')).toBe('Singapore');

    const item = within(screen.getByRole('region', { name: 'Line items' })).getByRole('row', {
      name: /Honda RC150/,
    });
    expect(
      within(item)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['2', 'AU$1,000.00', 'AU$2,000.00']);

    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(definitionOf(summary, 'Subtotal')).toBe('AU$2,000.00');
    expect(definitionOf(summary, 'Tax (10%)')).toBe('AU$200.00');
    expect(definitionOf(summary, 'Discount')).toBe('AU$20.00');
    expect(definitionOf(summary, 'Total')).toBe('AU$2,180.00');
    expect(definitionOf(summary, 'Amount paid')).toBe('AU$1,451.34');
    expect(definitionOf(summary, 'Outstanding balance')).toBe('AU$728.66');
  });

  it('links the customer email without letting it add mail headers', async () => {
    // Accepted by the API's email validator (RFC 5322 allows "?" and "&" in the local part).
    const email = 'billing?bcc=spy%40evil.example&subject=New%20bank%20details&x=@example.com';
    fakeApi.invoices[0] = {
      ...APPENDIX_A_INVOICE,
      customer: { ...APPENDIX_A_INVOICE.customer, email },
    };
    renderApp(`/invoices/${APPENDIX_A_INVOICE.invoiceId}`);

    const customer = await screen.findByRole('region', { name: 'Customer' });
    const link = within(customer).getByRole('link', { name: email });
    const href = new URL(link.getAttribute('href') ?? '');
    expect(href.protocol).toBe('mailto:');
    expect(decodeURIComponent(href.pathname)).toBe(email);
    expect(href.search).toBe('');
  });

  it('marks optional fields that were left empty', async () => {
    renderApp('/invoices/00000000-0000-4000-8000-000000000001');

    const details = await screen.findByRole('region', { name: 'Invoice details' });
    expect(definitionOf(details, 'Reference')).toBe('—Not provided');
    const customer = screen.getByRole('region', { name: 'Customer' });
    expect(definitionOf(customer, 'Mobile')).toBe('—Not provided');
    expect(definitionOf(customer, 'Address')).toBe('—Not provided');
  });

  it('says so when the invoice does not exist', async () => {
    renderApp('/invoices/00000000-0000-4000-8000-999999999999');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoice not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to invoices' })).toHaveAttribute(
      'href',
      '/invoices',
    );
  });

  it('treats a malformed id (400 from the API) as a missing invoice', async () => {
    server.use(
      http.get('/api/invoices/:invoiceId', () =>
        apiErrorResponse(400, 'Validation failed (uuid is expected)', 'Bad Request'),
      ),
    );
    renderApp('/invoices/not-a-uuid');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoice not found' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/uuid is expected/)).not.toBeInTheDocument();
  });

  it('shows a server error with its reference and a working retry', async () => {
    server.use(
      http.get(
        '/api/invoices/:invoiceId',
        () => apiErrorResponse(500, 'Internal server error', 'Internal Server Error'),
        { once: true },
      ),
    );
    const { user } = renderApp(`/invoices/${APPENDIX_A_INVOICE.invoiceId}`);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this invoice");
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(alert).toHaveTextContent('Reference: req-test-123');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Invoice IV1780488206995',
    );
  });

  it('returns to the list view it was opened from', async () => {
    renderApp(`/invoices/${APPENDIX_A_INVOICE.invoiceId}`, {
      state: { listSearch: '?status=Overdue&page=2' },
    });

    expect(await screen.findByRole('link', { name: 'Back to invoices' })).toHaveAttribute(
      'href',
      '/invoices?status=Overdue&page=2',
    );
  });

  it('ignores router state that is not a list query string', async () => {
    renderApp(`/invoices/${APPENDIX_A_INVOICE.invoiceId}`, {
      state: { listSearch: '//evil.example' },
    });

    expect(await screen.findByRole('link', { name: 'Back to invoices' })).toHaveAttribute(
      'href',
      '/invoices',
    );
  });
});
