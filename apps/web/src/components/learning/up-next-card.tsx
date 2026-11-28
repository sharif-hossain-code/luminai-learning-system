import type { UpNextAssessment } from '@luminai/contracts';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { Pill } from '@/components/ui/alert';
import { formatDuration } from '@/lib/course-format';
import { assessmentHref } from '@/lib/learning-links';
import { plural } from '@/lib/assessment-format';

/** Dashboard "Up next" (Assessment.dc.html, 5): open required quizzes. Hidden when empty. */
export function UpNextCard({ items }: { items: UpNextAssessment[] }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="up-next-heading"
      className="flex flex-col gap-2 rounded-lg border border-subtle bg-surface px-5 py-5 sm:px-6"
    >
      <h2 id="up-next-heading" className="text-h3 font-semibold">
        Up next
      </h2>
      <ul className="flex flex-col divide-y divide-subtle">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-warning-subtle">
              <ClipboardList aria-hidden className="size-5 text-warning-text" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {item.title}
                <span className="font-normal text-fg-muted"> · {item.course.title}</span>
              </p>
              <p className="text-caption text-fg-muted">
                {plural(item.questionCount, 'question')} · about{' '}
                {formatDuration(item.estimatedMinutes)}
              </p>
            </div>
            {item.inProgress ? <Pill tone="info">In progress</Pill> : null}
            <Link
              href={assessmentHref(item.course.slug, item.id)}
              className="rounded-sm text-support font-semibold text-primary hover:text-primary-hover"
            >
              {item.inProgress ? 'Resume' : 'Start'}
              <span className="sr-only"> {item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
