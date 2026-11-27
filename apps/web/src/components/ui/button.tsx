import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'lg' | 'md' | 'sm';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-fg hover:bg-primary-hover disabled:bg-primary/45 disabled:hover:bg-primary/45',
  secondary:
    'border border-default bg-surface text-fg hover:bg-hover disabled:text-fg-subtle disabled:hover:bg-surface',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-60',
  danger:
    'border border-danger/40 bg-surface text-danger-text hover:bg-danger-subtle disabled:opacity-60',
  link: 'h-auto px-0 text-primary underline-offset-4 hover:text-primary-hover hover:underline',
};

// lg = 48px (auth screens), md = 44px (app), sm = 36px (inline actions).
const sizes: Record<Size, string> = {
  lg: 'h-12 px-5 text-body',
  md: 'h-11 px-5 text-body',
  sm: 'h-9 px-3.5 text-support',
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string | undefined;
}) {
  return cn(
    base,
    variants[variant],
    variant !== 'link' && sizes[size],
    block && 'w-full',
    className,
  );
}

export function Button({
  variant,
  size,
  block,
  className,
  loading = false,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; block?: boolean }) {
  return <Link className={buttonClasses({ variant, size, block, className })} {...props} />;
}
