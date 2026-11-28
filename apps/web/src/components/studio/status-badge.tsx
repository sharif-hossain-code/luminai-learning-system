import type { CourseStatus } from '@luminai/contracts';
import { cn } from '@/lib/cn';
import { STATUS_LABELS } from '@/lib/course-format';

const TONES: Record<CourseStatus, string> = {
  DRAFT: 'bg-muted text-fg-muted',
  REVIEW: 'bg-warning-subtle text-warning-text',
  PUBLISHED: 'bg-success-subtle text-success-text',
  ARCHIVED: 'bg-muted text-fg-subtle',
};

const DOTS: Record<CourseStatus, string> = {
  DRAFT: 'bg-fg-subtle',
  REVIEW: 'bg-warning',
  PUBLISHED: 'bg-success',
  ARCHIVED: 'bg-fg-subtle/60',
};

export function StatusBadge({ status, className }: { status: CourseStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium whitespace-nowrap',
        TONES[status],
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', DOTS[status])} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ChangesBadge() {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-primary-subtle px-2.5 text-caption font-medium whitespace-nowrap text-primary-strong">
      Unpublished changes
    </span>
  );
}
