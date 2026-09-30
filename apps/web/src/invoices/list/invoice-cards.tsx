import { Link } from 'react-router';
import { formatDate, formatMoney } from '@/core/formatting/format';
import type { ReturnToListState } from '../common/return-to-list';
import { StatusBadge } from '../common/status-badge';
import type { InvoiceSummary } from '../model/invoice';

interface InvoiceCardsProps {
  invoices: InvoiceSummary[];
  linkState: ReturnToListState;
}

/** Small-screen alternative to the table: one card per invoice, the whole card is clickable. */
export function InvoiceCards({ invoices, linkState }: InvoiceCardsProps) {
  return (
    <ul aria-label="Invoices" className="divide-y divide-slate-100">
      {invoices.map((invoice) => (
        <li
          key={invoice.invoiceId}
          className="relative px-4 py-4 transition-colors hover:bg-slate-50 has-[a:focus-visible]:bg-slate-50"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* The ::after overlay stretches the link over the card while its name stays short. */}
              <Link
                to={`/invoices/${invoice.invoiceId}`}
                state={linkState}
                className="font-semibold text-blue-700 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-blue-600"
              >
                {invoice.invoiceNumber}
              </Link>
              <p className="mt-0.5 truncate text-sm text-slate-600">{invoice.customer.fullname}</p>
            </div>
            <StatusBadge status={invoice.status} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <dt className="text-slate-600">Invoice date</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {formatDate(invoice.invoiceDate)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">Due date</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{formatDate(invoice.dueDate)}</dd>
            </div>
            <div className="text-right">
              <dt className="text-slate-600">Total amount</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">
                {formatMoney(invoice.totalAmount, invoice)}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
