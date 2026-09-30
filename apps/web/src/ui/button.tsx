import { clsx } from 'clsx';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link, type LinkProps } from 'react-router';
import { focusRingClassName } from './class-names';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface ButtonStyleProps {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white shadow-xs hover:bg-blue-700 active:bg-blue-800',
  secondary: 'border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

function buttonClassName(
  { variant = 'primary', size = 'md' }: ButtonStyleProps,
  className?: string,
) {
  return clsx(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    focusRingClassName,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<'button'>, ButtonStyleProps {
  /** Shows a spinner and disables the button while an action is in flight. */
  loading?: boolean;
}

export function Button({
  variant,
  size,
  loading = false,
  className,
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size }, className)}
      disabled={loading || disabled}
      {...props}
    >
      {loading && (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:hidden" />
      )}
      {children}
    </button>
  );
}

/** A navigation link that looks like a button (navigation must stay a real link). */
export function ButtonLink({ variant, size, className, ...props }: LinkProps & ButtonStyleProps) {
  return <Link className={buttonClassName({ variant, size }, className)} {...props} />;
}
