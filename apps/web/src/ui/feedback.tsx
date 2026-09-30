import { clsx } from 'clsx';
import { CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from './button';

function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={clsx('animate-spin text-blue-600 motion-reduce:animate-none', className)}
    />
  );
}

/** Centered spinner with an announced label, for whole-page loading. */
export function PageSpinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
      <Spinner className="size-8" />
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none',
        className,
      )}
    />
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** Use "h1" when the empty state is the whole page (404s). */
  titleAs?: 'h1' | 'h2';
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  titleAs: Title = 'h2',
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-slate-100">
        <Icon aria-hidden="true" className="size-6 text-slate-500" />
      </span>
      <Title className="mt-4 text-base font-semibold text-slate-900">{title}</Title>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  message: string;
  requestId?: string | undefined;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({
  title,
  message,
  requestId,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-red-50">
        <CircleAlert aria-hidden="true" className="size-6 text-red-600" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-600">{message}</p>
      {requestId && <p className="mt-2 text-xs text-slate-600">Reference: {requestId}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </div>
  );
}

interface AlertProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: string;
  messages: string[];
}

/** Inline error banner; `role="alert"` makes screen readers announce it as soon as it appears. */
export function Alert({ title, messages, className, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={clsx(
        'flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 focus:outline-none',
        className,
      )}
      {...props}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-600" />
      <div className="text-sm">
        <p className="font-semibold text-red-800">{title}</p>
        {messages.length === 1 ? (
          <p className="mt-1 text-red-700">{messages[0]}</p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-red-700">
            {/* The API may repeat a message, so the text alone is not a unique key. */}
            {messages.map((message, index) => (
              <li key={`${index}:${message}`}>{message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
