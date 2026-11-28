import type { EnrolledCourse } from '@luminai/contracts';
import Link from 'next/link';
import { CategoryChip } from '@/components/catalog/course-card';
import { categoryAccent, formatDuration, plural } from '@/lib/course-format';
import { ProgressBar } from './progress-bar';

/** "My courses" card (Dashboard.dc.html, Learning.dc.html 2). The whole card links to the course. */
export function EnrolledCourseCard({ course }: { course: EnrolledCourse }) {
  const completed = course.enrollment.status === 'COMPLETED';
  const { progress, nextLesson } = course;
  const started = progress.completedLessons > 0 || nextLesson?.state === 'IN_PROGRESS';
  return (
    <article className="group relative flex h-full flex-col gap-2.5 rounded-lg border border-subtle bg-surface p-5 transition-colors focus-within:border-default hover:border-default">
      <CategoryChip
        slug={course.category.slug}
        name={course.category.name}
        className={`self-start ${categoryAccent(course.category.slug).tint}`}
      />
      <h3 className="text-[1.0625rem] leading-6 font-semibold">
        <Link
          href={completed ? `/courses/${course.slug}` : `/learn/${course.slug}`}
          className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-focus-within:underline group-focus-within:underline-offset-4"
        >
          {course.title}
        </Link>
      </h3>
      {!completed ? (
        <p className="text-caption text-fg-muted">
          {nextLesson
            ? `${started ? 'Next' : 'Start with'}: ${nextLesson.title} · ${formatDuration(nextLesson.estimatedMinutes)}`
            : 'Nothing left to open right now'}
        </p>
      ) : null}
      <ProgressBar
        percent={completed ? 100 : progress.percent}
        className="mt-auto"
        label={`${course.title} progress`}
      />
      <div className="flex items-center justify-between gap-3">
        {completed ? (
          <span className="text-caption font-medium text-success-text">Completed</span>
        ) : (
          <span className="text-caption text-fg-muted">
            {progress.percent}% · {progress.completedLessons} of{' '}
            {plural(progress.requiredLessons, 'lesson')}
          </span>
        )}
        <span aria-hidden className="text-support font-semibold text-primary">
          {completed ? 'Review' : started ? 'Continue' : 'Start'}
        </span>
      </div>
    </article>
  );
}
