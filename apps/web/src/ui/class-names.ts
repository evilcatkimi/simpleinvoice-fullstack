/** Shared look of text inputs, selects and textareas. `aria-invalid` drives the error state. */
export const controlClassName =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs ' +
  'placeholder:text-slate-500 focus:border-blue-600 focus:outline-3 focus:outline-blue-600/20 ' +
  'aria-invalid:border-red-500 aria-invalid:focus:outline-red-500/20 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export const focusRingClassName =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
