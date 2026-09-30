import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeywordSearch, SEARCH_DEBOUNCE_MS } from './keyword-search';

/**
 * Keystrokes are simulated with fireEvent: Testing Library's async user-event wrapper waits on a
 * real setTimeout, which never fires under Vitest's fake timers.
 */
function renderSearch(keyword = '') {
  const onSearch = vi.fn();
  const view = render(<KeywordSearch keyword={keyword} onSearch={onSearch} />);
  const input = screen.getByRole('searchbox', { name: 'Search invoices' });
  return {
    input,
    onSearch,
    typeText: (value: string) => fireEvent.change(input, { target: { value } }),
    pressEnter: () => fireEvent.submit(screen.getByRole('search')),
    rerenderWith: (nextKeyword: string) => {
      view.rerender(<KeywordSearch keyword={nextKeyword} onSearch={onSearch} />);
    },
  };
}

describe('KeywordSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`searches once, ${SEARCH_DEBOUNCE_MS} ms after the last keystroke`, () => {
    const { typeText, onSearch } = renderSearch();

    for (const text of ['p', 'pa', 'pau', 'paul']) {
      typeText(text);
      vi.advanceTimersByTime(100); // typing pauses shorter than the debounce restart the timer
    }
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 101);
    expect(onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('paul');
  });

  it('searches immediately on Enter', () => {
    const { typeText, pressEnter, onSearch } = renderSearch();

    typeText('paul');
    pressEnter();

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('paul');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it('trims the keyword and does not repeat a search for the same text', () => {
    const { typeText, pressEnter, onSearch } = renderSearch();

    typeText('  paul  ');
    pressEnter();
    typeText('paul ');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('paul');
  });

  it('reports a cleared box as an empty keyword', () => {
    const { typeText, onSearch } = renderSearch('paul');

    typeText('');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('');
  });

  it('shows a keyword changed elsewhere (Back button, Reset filters) without searching again', () => {
    const { input, onSearch, rerenderWith } = renderSearch('paul');

    rerenderWith('');

    expect(input).toHaveValue('');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('never overwrites what the user is typing when its own search reaches the URL', () => {
    const { input, typeText, onSearch, rerenderWith } = renderSearch();
    typeText('paul');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(onSearch).toHaveBeenCalledWith('paul');

    typeText('paul sm');
    rerenderWith('paul'); // the URL catches up with the search sent a moment ago

    expect(input).toHaveValue('paul sm');
  });
});
