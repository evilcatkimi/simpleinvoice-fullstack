import { clsx } from 'clsx';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, RotateCcw, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/ui/button';
import { focusRingClassName } from '@/ui/class-names';
import { Field, Select } from '@/ui/form-controls';
import { INVOICE_STATUSES, SORT_FIELDS, type SortField, type SortOrder } from '../model/invoice';
import { hasActiveFilters, type InvoiceListQuery } from '../model/list-query';
import { DateRangeFilter } from './date-range-filter';
import { KeywordSearch } from './keyword-search';

const SORT_FIELD_LABELS: Record<SortField, string> = {
  invoiceDate: 'Invoice date',
  dueDate: 'Due date',
  totalAmount: 'Total amount',
};

const SORT_ORDER_OPTIONS: { value: SortOrder; label: string; icon: LucideIcon }[] = [
  { value: 'DESC', label: 'Descending', icon: ArrowDownWideNarrow },
  { value: 'ASC', label: 'Ascending', icon: ArrowUpNarrowWide },
];

interface ListToolbarProps {
  params: InvoiceListQuery;
  onChange: (changes: Partial<InvoiceListQuery>, options?: { replace?: boolean }) => void;
  onReset: () => void;
}

export function ListToolbar({ params, onChange, onReset }: ListToolbarProps) {
  const orderLabelId = useId();

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 lg:flex lg:flex-wrap lg:items-end">
      <KeywordSearch
        className="col-span-2 lg:min-w-72 lg:flex-1"
        keyword={params.keyword ?? ''}
        // Typing replaces the history entry: Back should not replay every keystroke.
        onSearch={(keyword) => onChange({ keyword: keyword || undefined }, { replace: true })}
      />

      <Field label="Status" className="lg:w-40">
        {(control) => (
          <Select
            {...control}
            value={params.status ?? ''}
            onChange={(event) =>
              onChange({ status: INVOICE_STATUSES.find((status) => status === event.target.value) })
            }
          >
            <option value="">All statuses</option>
            {INVOICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Sort by" className="lg:w-44">
        {(control) => (
          <Select
            {...control}
            value={params.sortBy}
            onChange={(event) => {
              const sortBy = SORT_FIELDS.find((field) => field === event.target.value);
              if (sortBy) onChange({ sortBy });
            }}
          >
            {SORT_FIELDS.map((field) => (
              <option key={field} value={field}>
                {SORT_FIELD_LABELS[field]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="col-span-2 lg:col-span-1">
        <span id={orderLabelId} className="mb-1.5 block text-sm font-medium text-slate-700">
          Order
        </span>
        <div
          role="group"
          aria-labelledby={orderLabelId}
          className="grid h-9.5 grid-cols-2 rounded-lg border border-slate-300 bg-white p-0.5 shadow-xs"
        >
          {SORT_ORDER_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = params.ordering === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ordering: value })}
                className={clsx(
                  'flex items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                  focusRingClassName,
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <DateRangeFilter
        className="col-span-2 flex gap-3 lg:w-80"
        fromDate={params.fromDate}
        toDate={params.toDate}
        onChange={onChange}
      />

      {hasActiveFilters(params) && (
        <Button variant="ghost" className="col-span-2 justify-self-start" onClick={onReset}>
          <RotateCcw aria-hidden="true" className="size-4" />
          Reset filters
        </Button>
      )}
    </div>
  );
}
