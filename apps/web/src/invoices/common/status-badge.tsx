import { clsx } from 'clsx';
import type { InvoiceStatus } from '../model/invoice';

const STATUS_CLASSES: Record<InvoiceStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  Pending: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  Paid: 'bg-emerald-50 text-emerald-800 ring-emerald-600/25',
  Overdue: 'bg-red-50 text-red-700 ring-red-600/20',
};

/** The status is always spelled out, so colour is never the only signal. */
export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        STATUS_CLASSES[status],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
