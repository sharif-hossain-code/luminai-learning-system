import type {
  LearnerAssessmentOutline,
  LearnerModuleOutline,
  ProgressState,
} from '@luminai/contracts';
import { Check, ChevronDown, ClipboardCheck, ClipboardList, Lock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { assessmentHref, lessonHref } from '@/lib/learning-links';

const MODULE_STATE: Record<ProgressState, string> = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  NOT_STARTED: 'Not started',
};

function StateIcon({ state, current }: { state: ProgressState; current: boolean }) {
  if (state === 'COMPLETED') {
    return (
      <Check
        aria-hidden
        className="mt-0.5 size-[18px] shrink-0 text-success-text"
        strokeWidth={2.4}
      />
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-[18px] shrink-0" fill="none">
      <circle
        cx="12"
        cy="12"
        r="8"
        strokeWidth="2"
        className={current || state === 'IN_PROGRESS' ? 'stroke-primary' : 'stroke-fg-subtle'}
      />
      {current ? <circle cx="12" cy="12" r="3" className="fill-primary" /> : null}
    </svg>
  );
}

/** Quiz items use a clipboard instead of the lesson circle (Assessment.dc.html, 1). */
function QuizIcon({ state, current }: { state: ProgressState; current: boolean }) {
  if (state === 'COMPLETED') {
    return (
      <ClipboardCheck
        aria-hidden
        className="mt-0.5 size-[18px] shrink-0 text-success-text"
        strokeWidth={2.2}
      />
    );
  }
  return (
    <ClipboardList
      aria-hidden
      className={cn(
        'mt-0.5 size-[18px] shrink-0',
        current || state === 'IN_PROGRESS' ? 'text-primary' : 'text-fg-subtle',
      )}
    />
  );
}

function QuizItems({
  assessments,
  currentId,
  courseSlug,
}: {
  assessments: LearnerAssessmentOutline[];
  currentId: string;
  courseSlug: string;
}) {
  return assessments.map((quiz) => {
    const current = quiz.id === currentId;
    if (quiz.locked) {
      return (
        <li key={quiz.id} className="flex gap-2.5 px-3 py-2.5 text-support text-fg-muted">
          <Lock aria-hidden className="mt-0.5 size-[18px] shrink-0" />
          <span>
            {quiz.title}
            <span className="sr-only">, quiz, locked</span>
          </span>
        </li>
      );
    }
    const state =
      quiz.state === 'COMPLETED'
        ? ', passed'
        : quiz.outOfAttempts
          ? ', no attempts left'
          : quiz.state === 'IN_PROGRESS'
            ? ', not passed yet'
            : '';
    return (
      <li key={quiz.id}>
        <Link
          href={assessmentHref(courseSlug, quiz.id)}
          aria-current={current ? 'page' : undefined}
          className={cn(
            'flex gap-2.5 rounded-md px-3 py-2.5 text-support',
            current
              ? 'bg-primary-subtle font-semibold text-primary-strong'
              : 'text-fg hover:bg-hover',
          )}
        >
          <QuizIcon state={quiz.state} current={current} />
          <span>
            {quiz.title}
            <span className="sr-only">, quiz{state}</span>
            {!quiz.isRequired ? <span className="text-fg-muted"> · optional</span> : null}
          </span>
        </Link>
      </li>
    );
  });
}

function OutlineList({
  modules,
  finalAssessments,
  currentId,
  courseSlug,
}: {
  modules: LearnerModuleOutline[];
  finalAssessments: LearnerAssessmentOutline[];
  currentId: string;
  courseSlug: string;
}) {
  const hrefFor = (lessonId: string) => lessonHref(courseSlug, lessonId);
  const currentLessonId = currentId;
  const finalsLocked = finalAssessments.every((quiz) => quiz.locked);
  return (
    <div className="flex flex-col gap-1">
      {modules.map((module, index) => (
        <div key={module.id} className="flex flex-col gap-0.5">
          <p
            className={cn(
              'px-3 pt-3 pb-2 text-overline font-semibold tracking-wider text-fg-muted uppercase',
              index === 0 && 'pt-2',
            )}
          >
            Module {index + 1} · {module.locked ? 'Locked' : MODULE_STATE[module.state]}
          </p>
          <ul className="flex flex-col gap-0.5">
            {module.lessons.map((lesson) => {
              const current = lesson.id === currentLessonId;
              const state =
                lesson.state === 'COMPLETED'
                  ? ', completed'
                  : lesson.state === 'IN_PROGRESS'
                    ? ', in progress'
                    : '';
              if (lesson.locked) {
                return (
                  <li
                    key={lesson.id}
                    className="flex gap-2.5 px-3 py-2.5 text-support text-fg-muted"
                  >
                    <Lock aria-hidden className="mt-0.5 size-[18px] shrink-0" />
                    <span>
                      {lesson.title}
                      <span className="sr-only">, locked</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={lesson.id}>
                  <Link
                    href={hrefFor(lesson.id)}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex gap-2.5 rounded-md px-3 py-2.5 text-support',
                      current
                        ? 'bg-primary-subtle font-semibold text-primary-strong'
                        : 'text-fg hover:bg-hover',
                    )}
                  >
                    <StateIcon state={lesson.state} current={current} />
                    <span>
                      {lesson.title}
                      <span className="sr-only">{state}</span>
                      {!lesson.isRequired ? (
                        <span className="text-fg-muted"> · optional</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
            <QuizItems
              assessments={module.assessments}
              currentId={currentId}
              courseSlug={courseSlug}
            />
          </ul>
        </div>
      ))}
      {finalAssessments.length ? (
        <div className="flex flex-col gap-0.5">
          <p className="px-3 pt-3 pb-2 text-overline font-semibold tracking-wider text-fg-muted uppercase">
            Final assessment{finalsLocked ? ' · Locked' : ''}
          </p>
          <ul className="flex flex-col gap-0.5">
            <QuizItems
              assessments={finalAssessments}
              currentId={currentId}
              courseSlug={courseSlug}
            />
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Course outline beside the lesson: a card on large screens, and a collapsed
 * "Course outline" disclosure above the lesson on smaller ones (Learning.dc.html, 3).
 */
export function CourseOutlineNav({
  modules,
  finalAssessments,
  currentId,
  courseSlug,
}: {
  modules: LearnerModuleOutline[];
  finalAssessments: LearnerAssessmentOutline[];
  /** The lesson or quiz on screen. */
  currentId: string;
  courseSlug: string;
}) {
  const list = (
    <OutlineList
      modules={modules}
      finalAssessments={finalAssessments}
      currentId={currentId}
      courseSlug={courseSlug}
    />
  );
  return (
    <>
      <nav
        aria-label="Course outline"
        className="sticky top-6 hidden max-h-[calc(100dvh-7rem)] w-[280px] shrink-0 overflow-y-auto rounded-lg border border-subtle bg-surface p-3 lg:block"
      >
        {list}
      </nav>
      <details className="group rounded-lg border border-subtle bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
          Course outline
          <ChevronDown
            aria-hidden
            className="size-5 text-fg-subtle transition-transform group-open:rotate-180"
          />
        </summary>
        <nav aria-label="Course outline" className="border-t border-subtle p-2">
          {list}
        </nav>
      </details>
    </>
  );
}
