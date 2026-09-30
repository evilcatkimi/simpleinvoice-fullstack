import { clsx } from 'clsx';
import type { AriaAttributes, MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDate, formatMoney } from '@/core/formatting/format';
import { focusRingClassName } from '@/ui/class-names';
import type { ReturnToListState } from '../common/return-to-list';
import { StatusBadge } from '../common/status-badge';
import type { InvoiceSummary, SortField, SortOrder } from '../model/invoice';

interface InvoiceTableProps {
  invoices: InvoiceSummary[];
  sortBy: SortField;
  ordering: SortOrder;
  linkState: ReturnToListState;
}

const headerCellClassName =
  'px-4 py-3 text-left text-xs font-medium tracking-wide whitespace-nowrap text-slate-600 uppercase';

export function InvoiceTable({ invoices, sortBy, ordering, linkState }: InvoiceTableProps) {
  const navigate = useNavigate();

  const ariaSort = (field: SortField): AriaAttributes['aria-sort'] =>
    field === sortBy ? (ordering === 'ASC' ? 'ascending' : 'descending') : undefined;

  const openInvoice = (event: MouseEvent<HTMLTableRowElement>, invoiceId: string) => {
    // Plain left clicks only: a modified click keeps its browser meaning (Shift extends a text
    // selection; Cmd/Ctrl-click on the invoice link opens a new tab). Clicks on the link itself
    // are the link's, and selecting text in a row must stay possible.
    const modified =
      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    const clickedLink = event.target instanceof Element && event.target.closest('a') !== null;
    if (modified || clickedLink || window.getSelection()?.toString()) return;
    void navigate(`/invoices/${invoiceId}`, { state: linkState });
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">Invoices</caption>
        <thead className="bg-slate-50/80">
          <tr>
            <th scope="col" className={clsx(headerCellClassName, 'sm:pl-6')}>
              Invoice number
            </th>
            <th scope="col" className={headerCellClassName}>
              Customer name
            </th>
            <th scope="col" className={headerCellClassName} aria-sort={ariaSort('invoiceDate')}>
              Invoice date
            </th>
            <th scope="col" className={headerCellClassName} aria-sort={ariaSort('dueDate')}>
              Due date
            </th>
            <th
              scope="col"
              className={clsx(headerCellClassName, 'text-right')}
              aria-sort={ariaSort('totalAmount')}
            >
              Total amount
            </th>
            <th scope="col" className={clsx(headerCellClassName, 'sm:pr-6')}>
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {invoices.map((invoice) => (
            // The row click is a mouse shortcut only; keyboard and screen-reader users get the
            // same destination through the invoice-number link, so no key handler is needed.
            <tr
              key={invoice.invoiceId}
              onClick={(event) => openInvoice(event, invoice.invoiceId)}
              className="cursor-pointer transition-colors hover:bg-slate-50"
            >
              <th
                scope="row"
                className="px-4 py-3.5 text-left font-medium whitespace-nowrap sm:pl-6"
              >
                <Link
                  to={`/invoices/${invoice.invoiceId}`}
                  state={linkState}
                  className={clsx('rounded text-blue-700 hover:underline', focusRingClassName)}
                >
                  {invoice.invoiceNumber}
                </Link>
              </th>
              <td className="max-w-64 px-4 py-3.5">
                <div className="truncate font-medium text-slate-900">
                  {invoice.customer.fullname}
                </div>
                <div className="truncate text-xs text-slate-600">{invoice.customer.email}</div>
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-slate-700 tabular-nums">
                {formatDate(invoice.invoiceDate)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-slate-700 tabular-nums">
                {formatDate(invoice.dueDate)}
              </td>
              <td className="px-4 py-3.5 text-right font-medium whitespace-nowrap text-slate-900 tabular-nums">
                {formatMoney(invoice.totalAmount, invoice)}
              </td>
              <td className="px-4 py-3.5 sm:pr-6">
                <StatusBadge status={invoice.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
