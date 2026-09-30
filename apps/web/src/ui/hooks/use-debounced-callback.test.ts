import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedCallback } from './use-debounced-callback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once, after calls have stopped for the whole delay', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    result.current.schedule();
    vi.advanceTimersByTime(200);
    result.current.schedule(); // restarts the timer
    vi.advanceTimersByTime(299);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('runs immediately on flush and drops the pending run', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));

    result.current.schedule();
    result.current.flush();
    vi.advanceTimersByTime(1_000);

    expect(callback).toHaveBeenCalledOnce();
  });

  it('calls the latest callback, not the one from the render that scheduled it', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useDebouncedCallback(callback, 300), {
      initialProps: { callback: first },
    });

    result.current.schedule();
    rerender({ callback: latest });
    vi.advanceTimersByTime(300);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it('never fires after the component unmounts', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 300));

    result.current.schedule();
    unmount();
    vi.advanceTimersByTime(1_000);

    expect(callback).not.toHaveBeenCalled();
  });
});
