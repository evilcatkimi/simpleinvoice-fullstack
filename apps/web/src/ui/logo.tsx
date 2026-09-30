import { clsx } from 'clsx';

/** App mark (same artwork as the favicon); decorative, the product name is always shown next to it. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={clsx('shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <path
        d="M10 7.5h9l4 4v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 9 24.5V9a1.5 1.5 0 0 1 1-1.5Z"
        fill="#fff"
      />
      <path
        d="M13 15h7M13 18.5h7M13 22h4"
        stroke="#2563eb"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
