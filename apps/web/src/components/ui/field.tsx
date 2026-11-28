'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function FieldMessage({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string | undefined;
  hint?: ReactNode;
}) {
  if (error) {
    return (
      <p id={id} className="text-caption text-danger-text">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="text-caption text-fg-muted">
        {hint}
      </p>
    );
  }
  return null;
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  size?: 'lg' | 'md';
  /** Extra content between the input and the message, e.g. a strength meter. */
  after?: ReactNode;
};

export function TextField({
  label,
  error,
  hint,
  size = 'lg',
  after,
  className,
  id,
  ...props
}: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-message`;
  const hasMessage = Boolean(error || hint);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-support font-medium text-fg">
        {label}
      </label>
      <input
        id={inputId}
        className={cn('field-control', size === 'lg' ? 'h-12' : 'h-11')}
        aria-invalid={error ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        {...props}
      />
      {after}
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  options: readonly { value: string; label: string }[];
};

export function SelectField({
  label,
  hint,
  error,
  options,
  className,
  id,
  ...props
}: SelectFieldProps) {
  const generated = useId();
  const selectId = id ?? generated;
  const messageId = `${selectId}-message`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className="text-support font-medium text-fg">
        {label}
      </label>
      <select
        id={selectId}
        className="field-control h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10"
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? messageId : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  return (
    <label className={cn('flex items-start gap-2.5 text-support text-fg-muted', className)}>
      <input
        type="checkbox"
        className="mt-px size-[18px] shrink-0 cursor-pointer rounded accent-[var(--brand-primary)]"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
