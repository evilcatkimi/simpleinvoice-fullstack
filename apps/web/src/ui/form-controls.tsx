import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId } from 'react';
import { controlClassName } from './class-names';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={clsx(controlClassName, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={clsx(controlClassName, 'min-h-20', className)} {...props} />;
}

/** Native <select> (best keyboard and screen-reader support) with a custom chevron. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={clsx('relative', className)}>
      <select className={clsx(controlClassName, 'appearance-none pr-9')} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-500"
      />
    </div>
  );
}

/** Accessibility attributes a form control needs to be tied to its <Field> label, hint and error. */
export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
  'aria-required': true | undefined;
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + control + hint/error. The control is rendered through a render prop so any element
 * (input, select, textarea) receives the ids that bind the label and messages to it.
 */
export function Field({ label, error, hint, required = false, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const showHint = hint !== undefined && !error;
  const describedBy = [showHint && hintId, error && errorId].filter(Boolean).join(' ');

  return (
    <div className={className}>
      {/* The asterisk sits outside the <label> so the field's name stays exactly `label`;
          requiredness is announced through aria-required instead. */}
      <div className="mb-1.5 flex gap-0.5 text-sm font-medium">
        <label htmlFor={id} className="text-slate-700">
          {label}
        </label>
        {required && (
          <span aria-hidden="true" className="text-red-600">
            *
          </span>
        )}
      </div>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
        'aria-required': required || undefined,
      })}
      {showHint && (
        <p id={hintId} className="mt-1.5 text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
