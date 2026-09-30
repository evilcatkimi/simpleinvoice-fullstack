import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { pluralise } from '@/core/formatting/format';
import { Button } from '@/ui/button';
import { Select } from '@/ui/form-controls';
import type { Paging } from '../model/invoice';
import { PAGE_SIZES } from '../model/list-query';

interface PaginationBarProps {
  paging: Paging;
  /** Rows actually returned for this page (the last page is usually shorter). */
  itemCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: (typeof PAGE_SIZES)[number]) => void;
}

export function PaginationBar({
  paging,
  itemCount,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const pageSizeId = useId();
  const { page, pageSize, total, totalPages } = paging;
  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = firstItem + itemCount - 1;

  return (
    // Wraps on phones: the summary takes its own line and the page controls stay right-aligned.
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:px-6">
      {/* Not a live region: the list screen has one that stays mounted while this bar comes and goes. */}
      <p className="w-full sm:w-auto">
        Showing{' '}
        <span className="font-medium text-slate-900">
          {firstItem}–{lastItem}
        </span>{' '}
        of <span className="font-medium text-slate-900">{total}</span> {pluralise(total, 'invoice')}
      </p>

      <div className="flex items-center gap-2 sm:ml-auto">
        <label htmlFor={pageSizeId} className="whitespace-nowrap">
          Rows per page
        </label>
        <Select
          id={pageSizeId}
          value={pageSize}
          onChange={(event) => {
            const size = PAGE_SIZES.find((option) => option === Number(event.target.value));
            if (size) onPageSizeChange(size);
          }}
          className="w-20"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </div>

      <nav aria-label="Pagination" className="ml-auto flex items-center gap-2 sm:ml-0">
        <span className="mr-1 whitespace-nowrap">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-2"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-2"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </nav>
    </div>
  );
}
