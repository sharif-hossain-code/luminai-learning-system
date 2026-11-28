import type { EnrolledCourse } from '@luminai/contracts';
import { DomainArt } from '@/components/catalog/domain-art';
import { ButtonLink } from '@/components/ui/button';
import { formatDuration } from '@/lib/course-format';
import { stepHref } from '@/lib/learning-links';
import { ProgressBar } from './progress-bar';

/** "Continue where you left off" (Dashboard.dc.html). */
export function ContinueCard({ course }: { course: EnrolledCourse }) {
  const next = course.nextLesson!;
  const resuming = next.state === 'IN_PROGRESS' || course.progress.completedLessons > 0;
  const quiz = next.kind === 'ASSESSMENT';
  const place = quiz
    ? next.moduleNumber
      ? `Module ${next.moduleNumber} quiz`
      : 'Final assessment'
    : `Module ${next.moduleNumber}, lesson ${next.lessonNumber}`;
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
          {course.title} · {place}
          {course.progress.remainingMinutes > 0
            ? ` · about ${formatDuration(course.progress.remainingMinutes)} left in the course`
            : ''}
        </p>
        <ProgressBar percent={course.progress.percent} className="mt-1.5 max-w-[420px]" />
      </div>
      <ButtonLink href={stepHref(course.slug, next)} size="lg" className="px-7">
        {quiz ? 'Open the quiz' : resuming ? 'Resume lesson' : 'Start lesson'}
      </ButtonLink>
    </section>
  );
}
