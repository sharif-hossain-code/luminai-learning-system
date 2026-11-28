import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: 'bg-primary-subtle text-primary-strong', Icon: Info },
  success: { box: 'bg-success-subtle text-success-text', Icon: CircleCheck },
  warning: { box: 'bg-warning-subtle text-warning-text', Icon: TriangleAlert },
  danger: { box: 'bg-danger-subtle text-danger-text', Icon: CircleAlert },
};

/** Inline message. Errors use role="alert" so screen readers announce them. */
export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-md px-4 py-3 text-support', box, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const badgeTones: Record<Tone, string> = {
  info: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success-text',
  warning: 'bg-warning-subtle text-warning-text',
  danger: 'bg-danger-subtle text-danger-text',
};

/** 56px rounded square that holds a status icon at the top of a card. */
export function IconBadge({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('flex size-14 items-center justify-center rounded-lg', badgeTones[tone])}>
      {children}
    </span>
  );
}

export function Pill({ tone = 'success', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium',
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}
