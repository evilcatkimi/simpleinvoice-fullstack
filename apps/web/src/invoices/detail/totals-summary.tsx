import { clsx } from 'clsx';
import { formatMoney, formatPercent } from '@/core/formatting/format';
import type { InvoiceDetail } from '../model/invoice';

interface TotalsSummaryProps {
  invoice: Pick<
    InvoiceDetail,
    | 'currency'
    | 'currencySymbol'
    | 'taxRate'
    | 'invoiceSubTotal'
    | 'totalTax'
    | 'totalDiscount'
    | 'totalAmount'
    | 'totalPaid'
    | 'balanceAmount'
  >;
}

/**
 * Shows the server-calculated amounts exactly as returned. No arithmetic happens here on purpose:
 * the API is the single source of truth for money (decimal maths, rounding rules).
 */
export function TotalsSummary({ invoice }: TotalsSummaryProps) {
  const money = (amount: number) => formatMoney(amount, invoice);

  return (
    <dl className="space-y-3 text-sm">
      <SummaryRow label="Subtotal" value={money(invoice.invoiceSubTotal)} />
      <SummaryRow
        label={`Tax (${formatPercent(invoice.taxRate)})`}
        value={money(invoice.totalTax)}
      />
      <SummaryRow label="Discount" value={money(invoice.totalDiscount)} />
      <SummaryRow
        label="Total"
        value={money(invoice.totalAmount)}
        className="border-t border-slate-200 pt-3 font-semibold text-slate-900"
      />
      <SummaryRow label="Amount paid" value={money(invoice.totalPaid)} />
      <SummaryRow
        label="Outstanding balance"
        value={money(invoice.balanceAmount)}
        className="rounded-lg bg-slate-50 px-3 py-2.5 text-base font-semibold text-slate-900"
      />
    </dl>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  className?: string;
}

function SummaryRow({ label, value, className }: SummaryRowProps) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-4 text-slate-600', className)}>
      <dt>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
