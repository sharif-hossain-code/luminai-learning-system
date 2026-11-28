import type { LearnerCourse, LearnerLesson } from '@luminai/contracts';
import { ArrowLeft, ExternalLink, FileText, Lock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LessonContent } from '@/components/content/lesson-content';
import { CourseOutlineNav } from '@/components/learning/course-outline-nav';
import { LessonActions } from '@/components/learning/lesson-actions';
import { LessonMedia } from '@/components/learning/lesson-media';
import { LessonProgressProvider } from '@/components/learning/lesson-progress';
import { ProgressBar } from '@/components/learning/progress-bar';
import { ButtonLink } from '@/components/ui/button';
import { formatDuration, LESSON_TYPES } from '@/lib/course-format';
import { getLearnerCourse, getLesson, lessonHref } from '@/lib/learning';

type Params = Promise<{ slug: string; lessonId: string }>;

export const metadata: Metadata = { title: 'Lesson' };

/** Top bar from Lesson.dc.html: back to the dashboard, course and place, course progress. */
function PlayerHeader({ course, place }: { course: LearnerCourse; place: string | null }) {
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

function LockedLesson({ course }: { course: LearnerCourse }) {
  const blocking = course.modules.find(
    (module) => module.state !== 'COMPLETED' && module.isRequired,
  );
  return (
    <section className="flex max-w-[460px] flex-col items-start gap-4 rounded-lg border border-subtle bg-surface p-8">
      <span className="flex size-12 items-center justify-center rounded-md bg-muted">
        <Lock aria-hidden className="size-6 text-fg-muted" />
      </span>
      <h1 className="text-h1 font-semibold">This module is locked</h1>
      <p className="text-fg-muted">
        {blocking ? `Finish “${blocking.title}” to open it. ` : ''}Modules open in order so each one
        builds on the last.
      </p>
      {course.nextLesson ? (
        <ButtonLink href={lessonHref(course.slug, course.nextLesson.id)}>
          Go to your next lesson
        </ButtonLink>
      ) : null}
    </section>
  );
}

function Resources({ lesson }: { lesson: LearnerLesson }) {
  const extra = lesson.resources.filter(
    (resource) => resource.url && (resource.type === 'DOCUMENT' || resource.type === 'LINK'),
  );
  if (extra.length === 0) return null;
  return (
    <section aria-labelledby="resources-heading" className="flex flex-col gap-3">
      <h2 id="resources-heading" className="text-h3 font-semibold">
        {lesson.type === 'EXTERNAL_LINK' ? 'Open the resource' : 'Resources'}
      </h2>
      <ul className="flex flex-col gap-2">
        {extra.map((resource) => {
          const Icon = resource.type === 'DOCUMENT' ? FileText : ExternalLink;
          return (
            <li key={resource.id}>
              <a
                href={resource.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-md border border-subtle px-4 py-3 font-medium hover:bg-hover"
              >
                <Icon aria-hidden className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">{resource.title}</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LessonView({ course, lesson }: { course: LearnerCourse; lesson: LearnerLesson }) {
  const type = LESSON_TYPES[lesson.type];
  const media = lesson.resources.find(
    (r) => r.type === lesson.type && (r.type === 'VIDEO' || r.type === 'AUDIO'),
  );
  const captions = lesson.resources.find((r) => r.type === 'CAPTIONS');
  const transcript = lesson.resources.find((r) => r.type === 'TRANSCRIPT');
  return (
    <LessonProgressProvider
      key={lesson.id}
      lessonId={lesson.id}
      initial={lesson.progress}
      enrollmentStatus={course.enrollment.status}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {media ? (
          <LessonMedia
            type={lesson.type}
            media={media}
            captions={captions}
            transcript={transcript}
          />
        ) : null}
        <article className="flex flex-col gap-4 rounded-lg border border-subtle bg-surface px-5 py-7 sm:px-10 sm:py-8">
          <p className="text-overline font-semibold tracking-wider text-domain-communication uppercase">
            {type.label} · {formatDuration(lesson.estimatedMinutes)}
            {lesson.isRequired ? '' : ' · Optional'}
          </p>
          <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold">{lesson.title}</h1>
          {lesson.objectives.length ? (
            <div className="max-w-[68ch] rounded-md bg-muted px-4 py-3.5">
              <p className="font-semibold">In this lesson</p>
              <ul className="mt-1.5 list-disc pl-5 text-support">
                {lesson.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <LessonContent content={lesson.content} className="text-[1.0625rem] leading-7" />
          <Resources lesson={lesson} />
          <LessonActions
            type={lesson.type}
            completionRule={lesson.completionRule}
            previousHref={
              lesson.previousLessonId ? lessonHref(course.slug, lesson.previousLessonId) : null
            }
            next={
              lesson.next ? { ...lesson.next, href: lessonHref(course.slug, lesson.next.id) } : null
            }
            courseTitle={course.title}
            courseHref={`/courses/${course.slug}`}
            courseSlug={course.slug}
          />
        </article>
      </div>
    </LessonProgressProvider>
  );
}

async function Player({ params }: { params: Params }) {
  const { slug, lessonId } = await params;
  const [courseAccess, lessonAccess] = await Promise.all([
    getLearnerCourse(slug),
    getLesson(lessonId),
  ]);
  if (!courseAccess || !lessonAccess) notFound();
  if (courseAccess.state === 'not-enrolled' || lessonAccess.state === 'not-enrolled') {
    redirect(`/courses/${slug}`);
  }
  const { course } = courseAccess;
  const currentModule = course.modules.find((m) => m.lessons.some((l) => l.id === lessonId));
  // The lesson belongs to another course: send the learner to the right URL.
  if (lessonAccess.state === 'open' && lessonAccess.lesson.course.id !== course.id) {
    redirect(lessonHref(lessonAccess.lesson.course.slug, lessonId));
  }
  if (!currentModule) notFound();
  const moduleNumber = course.modules.indexOf(currentModule) + 1;
  const lessonNumber = currentModule.lessons.findIndex((l) => l.id === lessonId) + 1;

  return (
    <div className="flex min-h-dvh flex-col">
      <PlayerHeader
        course={course}
        place={`Module ${moduleNumber} · Lesson ${lessonNumber} of ${currentModule.lessons.length}`}
      />
      <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-start lg:gap-6">
        <CourseOutlineNav
          modules={course.modules}
          currentLessonId={lessonId}
          courseSlug={course.slug}
        />
        <main id="main-content" className="flex min-w-0 flex-1 justify-center">
          <div className="flex w-full max-w-[880px] flex-col">
            {lessonAccess.state === 'locked' ? (
              <LockedLesson course={course} />
            ) : (
              <LessonView course={course} lesson={lessonAccess.lesson} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function LessonPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="flex min-h-dvh flex-col">
          <span className="sr-only">Loading lesson…</span>
          <div className="h-16 border-b border-subtle bg-surface" />
          <div className="mx-auto mt-8 h-96 w-full max-w-[760px] animate-pulse rounded-lg bg-subtle" />
        </div>
      }
    >
      <Player params={params} />
    </Suspense>
  );
}
