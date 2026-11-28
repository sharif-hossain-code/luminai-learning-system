import type { EnrolledCourse } from '@luminai/contracts';
import { DomainArt } from '@/components/catalog/domain-art';
import { ButtonLink } from '@/components/ui/button';
import { formatDuration } from '@/lib/course-format';
import { lessonHref } from '@/lib/learning';
import { ProgressBar } from './progress-bar';

/** "Continue where you left off" (Dashboard.dc.html). */
export function ContinueCard({ course }: { course: EnrolledCourse }) {
  const next = course.nextLesson!;
  const resuming = next.state === 'IN_PROGRESS' || course.progress.completedLessons > 0;
  return (
    <section
      aria-labelledby="continue-heading"
      className="flex flex-wrap items-center gap-7 rounded-lg border border-primary-soft bg-surface-raised p-6 sm:p-7"
    >
      <DomainArt
        slug={course.category.slug}
        className="hidden h-[110px] w-40 shrink-0 rounded-md sm:flex"
        iconClassName="size-12"
      />
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
        <p className="text-overline font-semibold tracking-wider text-primary-strong uppercase">
          {resuming ? 'Continue where you left off' : 'Start your course'}
        </p>
        <h2 id="continue-heading" className="text-h2 font-semibold">
          {next.title}
        </h2>
        <p className="text-support text-fg-muted">
          {course.title} · Module {next.moduleNumber}, lesson {next.lessonNumber}
          {course.progress.remainingMinutes > 0
            ? ` · about ${formatDuration(course.progress.remainingMinutes)} left in the course`
            : ''}
        </p>
        <ProgressBar percent={course.progress.percent} className="mt-1.5 max-w-[420px]" />
      </div>
      <ButtonLink href={lessonHref(course.slug, next.id)} size="lg" className="px-7">
        {resuming ? 'Resume lesson' : 'Start lesson'}
      </ButtonLink>
    </section>
  );
}
