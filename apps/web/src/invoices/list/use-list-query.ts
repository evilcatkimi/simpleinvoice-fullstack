import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { type InvoiceListQuery, parseListQuery, toSearchParams } from '../model/list-query';

interface UpdateOptions {
  /** Replace the current history entry instead of pushing one (used while typing a search). */
  replace?: boolean;
}

/** Reads and writes the invoice list state held in the URL query string. */
export function useListQuery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => parseListQuery(searchParams), [searchParams]);

  const updateParams = useCallback(
    (changes: Partial<InvoiceListQuery>, options?: UpdateOptions) => {
      const changed = (Object.keys(changes) as (keyof InvoiceListQuery)[]).filter(
        (key) => changes[key] !== params[key],
      );
      // Re-selecting what is already applied (e.g. the active sort order) must neither add a
      // history entry nor send the user back to page 1.
      if (changed.length === 0) return;

      const next = { ...params, ...changes };
      // Any change other than a page jump can change which rows exist: start again at page 1.
      if (changed.some((key) => key !== 'page')) next.page = 1;
      setSearchParams(toSearchParams(next), options);
    },
    [params, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    updateParams({ status: undefined, keyword: undefined, fromDate: undefined, toDate: undefined });
  }, [updateParams]);

  return { params, updateParams, clearFilters };
}
