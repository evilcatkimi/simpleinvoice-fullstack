import { clsx } from 'clsx';
import { type ComponentProps, type ReactNode, useId } from 'react';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={clsx('rounded-xl border border-slate-200 bg-white shadow-xs', className)}
      {...props}
    />
  );
}

interface CardSectionProps extends Omit<ComponentProps<'section'>, 'title'> {
  title: string;
  description?: ReactNode;
}

/** A titled card; its heading names the <section> region for screen-reader navigation. */
export function CardSection({
  title,
  description,
  className,
  children,
  ...props
}: CardSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={clsx('rounded-xl border border-slate-200 bg-white shadow-xs', className)}
      {...props}
    >
      <header className="border-b border-slate-100 px-4 py-3.5 sm:px-6">
        <h2 id={headingId} className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </header>
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  );
}
