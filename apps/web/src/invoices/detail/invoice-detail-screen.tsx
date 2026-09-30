import { clsx } from 'clsx';
import { FileSearch } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useParams } from 'react-router';
import { isApiError } from '@/core/api/api-client';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/core/formatting/format';
import { mailtoHref } from '@/core/links/mailto';
import { ButtonLink } from '@/ui/button';
import { Card, CardSection } from '@/ui/card';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useDocumentTitle } from '@/ui/hooks/use-document-title';
import { PageHeader } from '@/ui/page-header';
import { QueryErrorState } from '@/ui/query-error-state';
import { getReturnToListPath } from '../common/return-to-list';
import { StatusBadge } from '../common/status-badge';
import { useInvoice } from '../data/invoice-queries';
import type { InvoiceDetail } from '../model/invoice';
import { TotalsSummary } from './totals-summary';

export function InvoiceDetailScreen() {
  const { invoiceId = '' } = useParams();
  const location = useLocation();
  const backTo = getReturnToListPath(location.state);
  const invoiceQuery = useInvoice(invoiceId);
  const { data: invoice, error, isPending, isError } = invoiceQuery;
  // A malformed id (400 from the API's UUID check) and an unknown one (404) both mean "not found".
  const notFound = isApiError(error, 404) || isApiError(error, 400);

  useDocumentTitle(
    invoice ? `Invoice ${invoice.invoiceNumber}` : notFound ? 'Invoice not found' : 'Invoice',
  );

  if (isPending) return <InvoiceDetailSkeleton />;

  if (notFound) {
    return (
      <Card>
        <EmptyState
          icon={FileSearch}
          title="Invoice not found"
          titleAs="h1"
          description="The invoice may not exist, or the link you followed is incorrect."
          action={
            <ButtonLink to={backTo} variant="secondary">
              Back to invoices
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Invoice" back={{ to: backTo, label: 'Back to invoices' }} />
        <Card>
          <QueryErrorState title="Couldn't load this invoice" query={invoiceQuery} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        back={{ to: backTo, label: 'Back to invoices' }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            Invoice {invoice.invoiceNumber}
            <StatusBadge status={invoice.status} />
          </span>
        }
        description={`Issued ${formatDate(invoice.invoiceDate)} · Due ${formatDate(invoice.dueDate)}`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CardSection title="Invoice details">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Invoice number" value={invoice.invoiceNumber} />
              <Detail label="Reference" value={invoice.invoiceReference} />
              <Detail label="Invoice date" value={formatDate(invoice.invoiceDate)} />
              <Detail label="Due date" value={formatDate(invoice.dueDate)} />
              <Detail label="Currency" value={`${invoice.currency} (${invoice.currencySymbol})`} />
              <Detail label="Created" value={formatDateTime(invoice.createdAt)} />
              <Detail label="Description" value={invoice.description} className="sm:col-span-2" />
            </dl>
          </CardSection>

          <CardSection title="Line items">
            <LineItemsTable invoice={invoice} />
          </CardSection>
        </div>

        <div className="space-y-6">
          <CardSection title="Summary">
            <TotalsSummary invoice={invoice} />
          </CardSection>

          <CardSection title="Customer">
            <dl className="space-y-4">
              <Detail label="Name" value={invoice.customer.fullname} />
              <Detail
                label="Email"
                value={
                  <a
                    href={mailtoHref(invoice.customer.email)}
                    className="text-blue-700 hover:underline"
                  >
                    {invoice.customer.email}
                  </a>
                }
              />
              <Detail label="Mobile" value={invoice.customer.mobileNumber} />
              <Detail label="Address" value={invoice.customer.address} />
            </dl>
          </CardSection>
        </div>
      </div>
    </>
  );
}

interface DetailProps {
  label: string;
  /** `null` (optional field left empty) renders as "—". */
  value: ReactNode;
  className?: string;
}

function Detail({ label, value, className }: DetailProps) {
  return (
    <div className={className}>
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words whitespace-pre-line text-slate-900">
        {value ?? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not provided</span>
          </>
        )}
      </dd>
    </div>
  );
}

function LineItemsTable({
  invoice,
}: {
  invoice: Pick<InvoiceDetail, 'items' | 'currency' | 'currencySymbol'>;
}) {
  const cell = 'px-2 py-3 text-right whitespace-nowrap tabular-nums sm:px-3';
  return (
    <div className="-mx-4 -my-4 overflow-x-auto sm:-mx-6 sm:-my-5">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 text-xs text-slate-600 uppercase sm:tracking-wide">
          <tr>
            <th scope="col" className="py-3 pr-2 pl-4 text-left font-medium sm:pr-3 sm:pl-6">
              Item
            </th>
            <th scope="col" className="px-2 py-3 text-right font-medium sm:px-3">
              {/* "Qty" on phones keeps the table within 375px; assistive tech always hears the full word. */}
              <span aria-hidden="true" className="sm:hidden">
                Qty
              </span>
              <span className="sr-only sm:not-sr-only">Quantity</span>
            </th>
            <th scope="col" className="px-2 py-3 text-right font-medium sm:px-3">
              Rate
            </th>
            <th scope="col" className="py-3 pr-4 pl-2 text-right font-medium sm:pr-6 sm:pl-3">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <th
                scope="row"
                className="py-3 pr-2 pl-4 text-left font-medium text-slate-900 sm:pr-3 sm:pl-6"
              >
                {item.name}
              </th>
              <td className={cell}>{formatNumber(item.quantity)}</td>
              <td className={cell}>{formatMoney(item.rate, invoice)}</td>
              <td className={clsx(cell, 'pr-4 font-medium text-slate-900 sm:pr-6')}>
                {formatMoney(item.amount, invoice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceDetailSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading invoice…</span>
      <Skeleton className="mb-4 h-4 w-32" />
      <Skeleton className="mb-8 h-8 w-72" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
