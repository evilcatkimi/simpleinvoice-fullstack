import { useEffect, useMemo, useRef } from 'react';

export interface DebouncedCallback {
  /** (Re)starts the timer; the callback runs once calls stop for the delay. */
  schedule: () => void;
  /** Runs the callback now and drops any pending run. */
  flush: () => void;
}

/**
 * Debounces `callback`. The latest callback is read when the timer fires, so it always sees the
 * newest props and state rather than those of the render that scheduled it.
 */
export function useDebouncedCallback(callback: () => void, delayMs: number): DebouncedCallback {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useMemo(
    () => ({
      schedule: () => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => callbackRef.current(), delayMs);
      },
      flush: () => {
        clearTimeout(timerRef.current);
        callbackRef.current();
      },
    }),
    [delayMs],
  );
}
