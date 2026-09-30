import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { KEYWORD_MAX_LENGTH } from '@/invoices/model/list-query';
import { apiErrorResponse, lastListRequest, fakeApi } from '@/test-support/fake-api';
import { APPENDIX_A_INVOICE } from '@/test-support/fixtures';
import { server } from '@/test-support/msw-server';
import { renderApp } from '@/test-support/render-app';
import { setViewportWidth } from '@/test-support/viewport';

const findTable = () => screen.findByRole('table', { name: 'Invoices' });
const dataRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);
const lastQuery = () => Object.fromEntries(lastListRequest() ?? []);
/** The screen's only status region: what screen readers announce about the results. */
const resultsStatus = () => screen.getByRole('status');

describe('InvoiceListScreen', () => {
  it('lists invoices with their key fields, newest first', async () => {
    renderApp('/invoices');

    const rows = dataRows(await findTable());
    expect(rows).toHaveLength(10);
    const first = within(rows[0]!);
    expect(first.getByRole('link', { name: 'IV1780488206995' })).toHaveAttribute(
      'href',
      `/invoices/${APPENDIX_A_INVOICE.invoiceId}`,
    );
    expect(first.getByText('Paul')).toBeInTheDocument();
    expect(first.getByText('3 Jun 2026')).toBeInTheDocument();
    expect(first.getByText('3 Jul 2026')).toBeInTheDocument();
    expect(first.getByText('AU$2,180.00')).toBeInTheDocument();
    expect(first.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText(/^Showing/)).toHaveTextContent('Showing 1–10 of 25 invoices');
    expect(resultsStatus()).toHaveTextContent('25 invoices found, page 1 of 3');
    expect(lastQuery()).toEqual({
      page: '1',
      pageSize: '10',
      sortBy: 'invoiceDate',
      ordering: 'DESC',
    });
  });

  it('switches to cards on small screens', async () => {
    setViewportWidth(375);
    renderApp('/invoices');

    const list = await screen.findByRole('list', { name: 'Invoices' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(within(list).getByRole('link', { name: 'IV1780488206995' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('searches after the user stops typing and keeps the keyword in the URL', async () => {
    const { user, currentUrl } = renderApp('/invoices');
    await findTable();

    await user.type(screen.getByRole('searchbox', { name: 'Search invoices' }), 'paul');

    await waitFor(() => expect(currentUrl()).toBe('/invoices?keyword=paul'));
    await waitFor(() => expect(dataRows(screen.getByRole('table'))).toHaveLength(1));
    expect(lastQuery()).toMatchObject({ keyword: 'paul', page: '1' });
    // One request for the settled keyword, not one per keystroke.
    expect(fakeApi.listRequests.filter((query) => query.has('keyword'))).toHaveLength(1);
  });

  it('maps status, sort, order and page size to the URL and the API, restarting at page 1', async () => {
    const { user, currentUrl } = renderApp('/invoices?page=2');
    await findTable();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Paid');
    await waitFor(() => expect(currentUrl()).toBe('/invoices?status=Paid'));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'Total amount');
    await user.click(screen.getByRole('button', { name: 'Ascending' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '20');

    await waitFor(() =>
      expect(currentUrl()).toBe(
        '/invoices?pageSize=20&sortBy=totalAmount&ordering=ASC&status=Paid',
      ),
    );
    await waitFor(() =>
      expect(lastQuery()).toEqual({
        page: '1',
        pageSize: '20',
        sortBy: 'totalAmount',
        ordering: 'ASC',
        status: 'Paid',
      }),
    );
    expect(screen.getByRole('button', { name: 'Ascending' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('columnheader', { name: 'Total amount' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('filters by invoice date range and refuses an inverted range', async () => {
    const { currentUrl } = renderApp('/invoices');
    await findTable();

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-05' } });
    await waitFor(() => expect(currentUrl()).toBe('/invoices?fromDate=2026-01-05'));

    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-01-01' } });

    expect(await screen.findByText('Must be on or after the From date')).toBeInTheDocument();
    expect(screen.getByLabelText('To date')).toHaveAttribute('aria-invalid', 'true');
    expect(currentUrl()).toBe('/invoices?fromDate=2026-01-05');
  });

  it('pages through the results', async () => {
    const { user, currentUrl } = renderApp('/invoices');
    await findTable();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2 of 3');
    expect(currentUrl()).toBe('/invoices?page=2');
    expect(screen.getByText(/^Showing/)).toHaveTextContent('Showing 11–20 of 25 invoices');
    expect(resultsStatus()).toHaveTextContent('25 invoices found, page 2 of 3');

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 3 of 3');
    expect(screen.getByText(/^Showing/)).toHaveTextContent('Showing 21–25 of 25 invoices');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await screen.findByText('Page 2 of 3');
    expect(currentUrl()).toBe('/invoices?page=2');
  });

  it('ignores re-selecting the sort order already applied: same page, no new history entry', async () => {
    const { user, router, currentUrl } = renderApp('/invoices?page=3');
    await screen.findByText('Page 3 of 3');
    const entryKey = router.state.location.key;

    await user.click(screen.getByRole('button', { name: 'Descending' }));

    expect(currentUrl()).toBe('/invoices?page=3');
    expect(router.state.location.key).toBe(entryKey);
  });

  it('announces results and empty states through one status region that stays mounted', async () => {
    const { user } = renderApp('/invoices');
    await findTable();
    const status = resultsStatus();
    expect(status).toHaveTextContent('25 invoices found, page 1 of 3');
    const search = screen.getByRole('searchbox', { name: 'Search invoices' });

    await user.type(search, 'paul');
    await waitFor(() => expect(status).toHaveTextContent(/^1 invoice found$/));
    expect(screen.getByText(/^Showing/)).toHaveTextContent(/^Showing 1–1 of 1 invoice$/);

    await user.clear(search);
    await user.type(search, 'nobody');
    await screen.findByRole('heading', { name: 'No invoices match your filters' });
    expect(status).toHaveTextContent('No invoices match your filters');
    expect(resultsStatus()).toBe(status);
  });

  it('caps the search at the API limit of 100 characters', async () => {
    const { user } = renderApp('/invoices');
    await findTable();
    const search = screen.getByRole('searchbox', { name: 'Search invoices' });

    await user.click(search);
    await user.paste('x'.repeat(KEYWORD_MAX_LENGTH + 1));

    expect(search).toHaveValue('x'.repeat(KEYWORD_MAX_LENGTH));
    await waitFor(() => expect(lastQuery().keyword).toHaveLength(KEYWORD_MAX_LENGTH));
  });

  it('shows an empty state that clears the filters', async () => {
    const { user, currentUrl } = renderApp('/invoices?keyword=nobody&status=Paid');

    expect(
      await screen.findByRole('heading', { name: 'No invoices match your filters' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    await findTable();
    expect(currentUrl()).toBe('/invoices');
    expect(screen.getByRole('searchbox', { name: 'Search invoices' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('');
  });

  it('offers the first page when a stale link points past the last one', async () => {
    const { user, currentUrl } = renderApp('/invoices?page=9');

    expect(await screen.findByRole('heading', { name: 'This page is empty' })).toBeInTheDocument();
    expect(screen.getByText('This list has 3 pages.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to first page' }));

    expect(dataRows(await findTable())).toHaveLength(10);
    expect(currentUrl()).toBe('/invoices');
  });

  it('explains an empty list without offering to clear filters', async () => {
    fakeApi.invoices = [];
    renderApp('/invoices');

    expect(await screen.findByRole('heading', { name: 'No invoices yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('restarts at page 1 when the keyword changes and drops it from the URL once cleared', async () => {
    const { user, currentUrl } = renderApp('/invoices?page=3');
    await findTable();
    const search = screen.getByRole('searchbox', { name: 'Search invoices' });

    await user.type(search, 'INV-00');
    await waitFor(() => expect(currentUrl()).toBe('/invoices?keyword=INV-00'));

    await user.clear(search);
    await waitFor(() => expect(currentUrl()).toBe('/invoices'));
    await waitFor(() => expect(lastQuery()).not.toHaveProperty('keyword'));
  });

  it('drops a cleared date from the URL', async () => {
    const { currentUrl } = renderApp('/invoices?fromDate=2026-01-05&toDate=2026-01-31');
    await findTable();

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '' } });

    await waitFor(() => expect(currentUrl()).toBe('/invoices?toDate=2026-01-31'));
  });

  it('shows an error with a working retry', async () => {
    server.use(
      http.get(
        '/api/invoices',
        () => apiErrorResponse(500, 'Internal server error', 'Internal Server Error'),
        { once: true },
      ),
    );
    const { user } = renderApp('/invoices');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load invoices");
    expect(alert).toHaveTextContent('Reference: req-test-123');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await findTable()).toBeInTheDocument();
  });

  it('falls back to defaults for invalid URL parameters', async () => {
    renderApp('/invoices?page=-3&pageSize=7&sortBy=hack&ordering=sideways&status=Lost');

    await findTable();
    expect(lastQuery()).toEqual({
      page: '1',
      pageSize: '10',
      sortBy: 'invoiceDate',
      ordering: 'DESC',
    });
  });

  it('opens an invoice from its row and comes back to the same list view', async () => {
    const { user, currentUrl } = renderApp('/invoices?status=Overdue');
    const table = await findTable();

    await user.click(within(table).getByText('Paul'));
    expect(
      await screen.findByRole('heading', { level: 1, name: /Invoice IV1780488206995/ }),
    ).toBeInTheDocument();
    expect(currentUrl()).toBe(`/invoices/${APPENDIX_A_INVOICE.invoiceId}`);

    await user.click(screen.getByRole('link', { name: 'Back to invoices' }));
    await findTable();
    expect(currentUrl()).toBe('/invoices?status=Overdue');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Overdue');
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['middle-button', { button: 1 }],
  ])('leaves a %s click on a row to the browser', async (_kind, init) => {
    const { currentUrl } = renderApp('/invoices');
    const table = await findTable();

    fireEvent.click(within(table).getByText('Paul'), init);

    expect(currentUrl()).toBe('/invoices');
  });

  it('links to the create form', async () => {
    const { user, currentUrl } = renderApp('/invoices');
    await findTable();

    await user.click(screen.getByRole('link', { name: 'New invoice' }));

    expect(
      await screen.findByRole('heading', { name: 'New invoice', level: 1 }),
    ).toBeInTheDocument();
    expect(currentUrl()).toBe('/invoices/new');
  });
});
