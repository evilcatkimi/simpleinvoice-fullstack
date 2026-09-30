import { screen } from '@testing-library/react';
import { describe, it } from 'vitest';
import { expectNoSeriousA11yViolations } from '@/test-support/axe';
import { APPENDIX_A_INVOICE } from '@/test-support/fixtures';
import { renderApp } from '@/test-support/render-app';
import { setViewportWidth } from '@/test-support/viewport';

/** axe smoke test of every screen, in its normal and its error state: no serious or critical issues. */
describe('accessibility', () => {
  it('login screen, including its validation errors', async () => {
    const { container, user } = renderApp('/login', { signedIn: false });
    await screen.findByRole('heading', { name: 'Sign in to SimpleInvoice' });
    await expectNoSeriousA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Email is required');
    await expectNoSeriousA11yViolations(container);
  });

  it('invoice list as a table (desktop)', async () => {
    const { container } = renderApp('/invoices');
    await screen.findByRole('table', { name: 'Invoices' });

    await expectNoSeriousA11yViolations(container);
  });

  it('invoice list as cards (phone)', async () => {
    setViewportWidth(375);
    const { container } = renderApp('/invoices');
    await screen.findByRole('list', { name: 'Invoices' });

    await expectNoSeriousA11yViolations(container);
  });

  it('invoice list with no match', async () => {
    const { container } = renderApp('/invoices?keyword=nobody');
    await screen.findByRole('heading', { name: 'No invoices match your filters' });

    await expectNoSeriousA11yViolations(container);
  });

  it('invoice detail', async () => {
    const { container } = renderApp(`/invoices/${APPENDIX_A_INVOICE.invoiceId}`);
    await screen.findByRole('region', { name: 'Summary' });

    await expectNoSeriousA11yViolations(container);
  });

  it('create form, including its validation errors', async () => {
    const { container, user } = renderApp('/invoices/new');
    await screen.findByRole('heading', { name: 'New invoice', level: 1 });
    await expectNoSeriousA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Create invoice' }));
    await screen.findByText('Customer name is required');
    await expectNoSeriousA11yViolations(container);
  });
});
