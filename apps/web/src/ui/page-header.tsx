import { clsx } from 'clsx';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, type To } from 'react-router';
import { focusRingClassName } from './class-names';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: To; label: string };
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          to={back.to}
          className={clsx(
            'mb-3 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 hover:text-slate-900',
            focusRingClassName,
          )}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
