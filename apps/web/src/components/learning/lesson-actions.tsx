'use client';

import type { CompletionRule, LessonType } from '@luminai/contracts';
import { Check, PartyPopper } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { useLessonProgress } from './lesson-progress';

/** The footer of a lesson: previous, completion and next, following the lesson's completion rule. */
export function LessonActions({
  type,
  completionRule,
  previousHref,
  next,
  courseTitle,
  courseHref,
  courseSlug,
}: {
  type: LessonType;
  completionRule: CompletionRule;
  previousHref: string | null;
  next: { href: string; title: string; locked: boolean } | null;
  courseTitle: string;
  courseHref: string;
  courseSlug: string;
}) {
  const router = useRouter();
  const { progress, save, finishedCourse, course } = useLessonProgress();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completed = progress.state === 'COMPLETED';
  const nextOpen = next && !next.locked;

  async function markComplete() {
    setPending(true);
    setError(null);
    try {
      const result = await save({ completed: true });
      // Continue with the course's next lesson (it may be earlier, if something was skipped).
      const target = result.course.nextLesson;
      if (target && result.course.enrollmentStatus !== 'COMPLETED') {
        router.push(`/learn/${courseSlug}/${target.id}`);
      } else {
        setPending(false);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Your progress was not saved. Try again.',
      );
      setPending(false);
    }
  }

  const media = type === 'AUDIO' ? 'audio' : 'video';
  return (
    <div className="mt-2 flex flex-col gap-4 border-t border-subtle pt-5">
      {finishedCourse ? (
        <section
          aria-labelledby="course-finished"
          className="flex flex-col items-start gap-3 rounded-lg border border-success/30 bg-success-subtle p-6"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-surface text-success-text">
            <PartyPopper aria-hidden className="size-6" />
          </span>
          <h2 id="course-finished" className="text-h2 font-semibold">
            You finished the course
          </h2>
          <p className="text-fg-muted">All required lessons in “{courseTitle}” are complete.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
            <ButtonLink href="/courses" variant="secondary">
              Explore more courses
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {completed ? (
        <p
          role="status"
          className="flex items-center gap-2 text-support font-medium text-success-text"
        >
          <Check aria-hidden className="size-4" strokeWidth={3} />
          Completed
        </p>
      ) : completionRule === 'MEDIA_FINISHED' ? (
        <p className="text-support text-fg-muted">
          Play the {media} to the end to complete this lesson.
        </p>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap justify-between gap-3">
        {previousHref ? (
          <ButtonLink href={previousHref} variant="secondary">
            Previous lesson
          </ButtonLink>
        ) : (
          <span />
        )}
        {!completed && completionRule === 'MARK_COMPLETE' ? (
          <Button onClick={markComplete} loading={pending}>
            {next ? 'Mark complete and continue' : 'Mark complete'}
          </Button>
        ) : nextOpen ? (
          <ButtonLink href={next.href} variant={completed ? 'primary' : 'secondary'}>
            Next lesson
          </ButtonLink>
        ) : !next && completed && !finishedCourse ? (
          <ButtonLink href={courseHref} variant="secondary">
            {course?.enrollmentStatus === 'COMPLETED' ? 'Course overview' : 'Back to course'}
          </ButtonLink>
        ) : next?.locked ? (
          <p className="self-center text-support text-fg-muted">
            Complete the rest of this module to open the next one.
          </p>
        ) : null}
      </div>
    </div>
  );
}
