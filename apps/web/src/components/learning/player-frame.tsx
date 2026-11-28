import type { LearnerCourse } from '@luminai/contracts';
import { ArrowLeft, Lock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { stepHref } from '@/lib/learning-links';
import { CourseOutlineNav } from './course-outline-nav';
import { ProgressBar } from './progress-bar';

/** Top bar from Lesson.dc.html: back to the dashboard, course and place, course progress. */
export function PlayerHeader({ course, place }: { course: LearnerCourse; place: string | null }) {
  return (
    <header className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-subtle bg-surface px-4 py-3 sm:px-6">
      <ButtonLink href="/dashboard" variant="secondary" size="sm">
        <ArrowLeft aria-hidden className="size-4" />
        Dashboard
      </ButtonLink>
      <div className="min-w-[200px] flex-1">
        <Link
          href={`/courses/${course.slug}`}
          className="block rounded-sm text-body font-semibold hover:underline hover:underline-offset-4"
        >
          {course.title}
        </Link>
        {place ? <p className="text-caption text-fg-muted">{place}</p> : null}
      </div>
      <div className="flex items-center gap-2.5 text-caption text-fg-muted">
        <ProgressBar percent={course.progress.percent} size="sm" className="w-40" />
        <span>{course.progress.percent}% complete</span>
      </div>
    </header>
  );
}

/** The lesson player frame: header, outline (card or disclosure) and the main column. */
export function PlayerFrame({
  course,
  place,
  currentId,
  children,
}: {
  course: LearnerCourse;
  place: string | null;
  currentId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PlayerHeader course={course} place={place} />
      <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-start lg:gap-6">
        <CourseOutlineNav
          modules={course.modules}
          finalAssessments={course.finalAssessments}
          currentId={currentId}
          courseSlug={course.slug}
        />
        <main id="main-content" className="flex min-w-0 flex-1 justify-center">
          <div className="flex w-full max-w-[880px] flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PlayerLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-dvh flex-col">
      <span className="sr-only">{label}</span>
      <div className="h-16 border-b border-subtle bg-surface" />
      <div className="mx-auto mt-8 h-96 w-full max-w-[760px] animate-pulse rounded-lg bg-subtle" />
    </div>
  );
}

/** Learning.dc.html, 3: a locked lesson or quiz. */
export function LockedStep({ course, kind }: { course: LearnerCourse; kind: 'lesson' | 'quiz' }) {
  const blocking = course.modules.find(
    (module) => module.state !== 'COMPLETED' && module.isRequired,
  );
  return (
    <section className="flex max-w-[460px] flex-col items-start gap-4 rounded-lg border border-subtle bg-surface p-8">
      <span className="flex size-12 items-center justify-center rounded-md bg-muted">
        <Lock aria-hidden className="size-6 text-fg-muted" />
      </span>
      <h1 className="text-h1 font-semibold">
        {kind === 'quiz' ? 'This quiz is locked' : 'This module is locked'}
      </h1>
      <p className="text-fg-muted">
        {blocking ? `Finish “${blocking.title}” to open it. ` : ''}Modules open in order so each one
        builds on the last.
      </p>
      {course.nextLesson ? (
        <ButtonLink href={stepHref(course.slug, course.nextLesson)}>
          {course.nextLesson.kind === 'ASSESSMENT'
            ? 'Go to your next quiz'
            : 'Go to your next lesson'}
        </ButtonLink>
      ) : null}
    </section>
  );
}
