import { useState } from 'react';
import { Field, Input } from '@/ui/form-controls';

interface DateRange {
  fromDate?: string | undefined;
  toDate?: string | undefined;
}

interface DateRangeFilterProps extends DateRange {
  onChange: (range: DateRange) => void;
  className?: string;
}

function isInverted({ fromDate, toDate }: DateRange): boolean {
  // "YYYY-MM-DD" strings sort chronologically, so a string comparison is enough.
  return Boolean(fromDate && toDate && fromDate > toDate);
}

/**
 * Invoice-date range. The inputs keep a local draft so an inverted range can be shown with an
 * error instead of being sent (the API answers 400); valid ranges are applied immediately.
 */
export function DateRangeFilter({ fromDate, toDate, onChange, className }: DateRangeFilterProps) {
  const [draft, setDraft] = useState<DateRange>({ fromDate, toDate });
  const [applied, setApplied] = useState<DateRange>({ fromDate, toDate });

  // The URL changed (back/forward, "Reset filters"): show the range it now holds.
  if (fromDate !== applied.fromDate || toDate !== applied.toDate) {
    setApplied({ fromDate, toDate });
    setDraft({ fromDate, toDate });
  }

  const update = (next: DateRange) => {
    setDraft(next);
    if (!isInverted(next)) onChange(next);
  };

  return (
    <div className={className}>
      <Field label="From date" className="min-w-0 flex-1">
        {(control) => (
          <Input
            {...control}
            type="date"
            value={draft.fromDate ?? ''}
            max={draft.toDate}
            onChange={(event) => update({ ...draft, fromDate: event.target.value || undefined })}
          />
        )}
      </Field>
      <Field
        label="To date"
        className="min-w-0 flex-1"
        error={isInverted(draft) ? 'Must be on or after the From date' : undefined}
      >
        {(control) => (
          <Input
            {...control}
            type="date"
            value={draft.toDate ?? ''}
            min={draft.fromDate}
            onChange={(event) => update({ ...draft, toDate: event.target.value || undefined })}
          />
        )}
      </Field>
    </div>
  );
}
