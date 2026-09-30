import type { UseQueryResult } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Inbox, SearchX } from 'lucide-react';
import { pluralise } from '@/core/formatting/format';
import { Button } from '@/ui/button';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useMediaQuery } from '@/ui/hooks/use-media-query';
import { QueryErrorState } from '@/ui/query-error-state';
import type { ReturnToListState } from '../common/return-to-list';
import type { InvoiceListResponse } from '../model/invoice';
import { hasActiveFilters, type InvoiceListQuery } from '../model/list-query';
import { InvoiceCards } from './invoice-cards';
import { InvoiceTable } from './invoice-table';
import { PaginationBar } from './pagination-bar';

/** Tailwind's `md` breakpoint: the table needs about this much room, below it cards read better. */
const TABLE_MEDIA_QUERY = '(min-width: 48rem)';

interface InvoiceResultsProps {
  query: UseQueryResult<InvoiceListResponse>;
  params: InvoiceListQuery;
  onParamsChange: (changes: Partial<InvoiceListQuery>) => void;
  onClearFilters: () => void;
  /** Router state for links out of the list, so their screens can return to this exact view. */
  linkState: ReturnToListState;
}

/** Whatever the list request currently has to show: a skeleton, an error, an empty state or rows. */
export function InvoiceResults({
  query,
  params,
  onParamsChange,
  onClearFilters,
  linkState,
}: InvoiceResultsProps) {
  const showTable = useMediaQuery(TABLE_MEDIA_QUERY);

  if (query.isPending) return <InvoiceListSkeleton />;
  if (query.isError) return <QueryErrorState title="Couldn't load invoices" query={query} />;

  const { data: invoices, paging } = query.data;
  if (invoices.length === 0) {
    if (hasActiveFilters(params)) {
      return (
        <EmptyState
          icon={SearchX}
          title="No invoices match your filters"
          description="Try a different search term, status or date range."
          action={
            <Button variant="secondary" onClick={onClearFilters}>
              Clear filters
            </Button>
          }
        />
      );
    }
    if (paging.total > 0) {
      return (
        <EmptyState
          icon={Inbox}
          title="This page is empty"
          description={`This list has ${paging.totalPages} ${pluralise(paging.totalPages, 'page')}.`}
          action={
            <Button variant="secondary" onClick={() => onParamsChange({ page: 1 })}>
              Go to first page
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={Inbox}
        title="No invoices yet"
        description="Invoices you create will appear here."
      />
    );
  }

  return (
    <>
      {/* The previous page stays visible (dimmed) while the next one loads: no layout jump. */}
      <div
        className={clsx(
          'transition-opacity',
          query.isPlaceholderData && 'pointer-events-none opacity-60',
        )}
      >
        {showTable ? (
          <InvoiceTable
            invoices={invoices}
            sortBy={params.sortBy}
            ordering={params.ordering}
            linkState={linkState}
          />
        ) : (
          <InvoiceCards invoices={invoices} linkState={linkState} />
        )}
      </div>
      <PaginationBar
        paging={paging}
        itemCount={invoices.length}
        onPageChange={(page) => onParamsChange({ page })}
        onPageSizeChange={(pageSize) => onParamsChange({ pageSize })}
      />
    </>
  );
}

function InvoiceListSkeleton() {
  // Silent: the list screen's status region already says "Loading invoices…".
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4 sm:px-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
