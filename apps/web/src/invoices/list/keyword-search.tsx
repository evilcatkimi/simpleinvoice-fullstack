import { Search } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Input } from '@/ui/form-controls';
import { useDebouncedCallback } from '@/ui/hooks/use-debounced-callback';
import { KEYWORD_MAX_LENGTH } from '../model/list-query';

export const SEARCH_DEBOUNCE_MS = 300;

interface KeywordSearchProps {
  /** Keyword currently applied (from the URL). */
  keyword: string;
  onSearch: (keyword: string) => void;
  className?: string;
}

/**
 * Debounced search box. The input is uncontrolled: while the user types it is the source of truth,
 * so a URL update arriving mid-typing can never overwrite fresh keystrokes. Only URL changes this
 * field did not make (back/forward, "Reset filters") are copied into it.
 */
export function KeywordSearch({ keyword, onSearch, className }: KeywordSearchProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSentRef = useRef(keyword);

  useEffect(() => {
    if (keyword !== lastSentRef.current && inputRef.current) {
      inputRef.current.value = keyword;
      lastSentRef.current = keyword;
    }
  }, [keyword]);

  const search = useDebouncedCallback(() => {
    const next = inputRef.current?.value.trim() ?? '';
    if (next === lastSentRef.current) return;
    lastSentRef.current = next;
    onSearch(next);
  }, SEARCH_DEBOUNCE_MS);

  return (
    <form
      role="search"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        search.flush();
      }}
    >
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        Search invoices
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
        />
        <Input
          ref={inputRef}
          id={id}
          type="search"
          defaultValue={keyword}
          onChange={search.schedule}
          maxLength={KEYWORD_MAX_LENGTH}
          placeholder="Invoice number or customer name"
          autoComplete="off"
          className="pl-9"
        />
      </div>
    </form>
  );
}
