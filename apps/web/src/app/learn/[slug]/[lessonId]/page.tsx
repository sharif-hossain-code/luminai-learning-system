import type { LearnerCourse, LearnerLesson } from '@luminai/contracts';
import { ExternalLink, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LessonContent } from '@/components/content/lesson-content';
import { LessonActions } from '@/components/learning/lesson-actions';
import { LessonMedia } from '@/components/learning/lesson-media';
import { LessonProgressProvider } from '@/components/learning/lesson-progress';
import { LockedStep, PlayerFrame, PlayerLoading } from '@/components/learning/player-frame';
import { formatDuration, LESSON_TYPES } from '@/lib/course-format';
import { getLearnerCourse, getLesson, lessonHref, stepHref } from '@/lib/learning';

type Params = Promise<{ slug: string; lessonId: string }>;

export const metadata: Metadata = { title: 'Lesson' };

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
            next={lesson.next ? { ...lesson.next, href: stepHref(course.slug, lesson.next) } : null}
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
    <PlayerFrame
      course={course}
      currentId={lessonId}
      place={`Module ${moduleNumber} · Lesson ${lessonNumber} of ${currentModule.lessons.length}`}
    >
      {lessonAccess.state === 'locked' ? (
        <LockedStep course={course} kind="lesson" />
      ) : (
        <LessonView course={course} lesson={lessonAccess.lesson} />
      )}
    </PlayerFrame>
  );
}

export default function LessonPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PlayerLoading label="Loading lesson…" />}>
      <Player params={params} />
    </Suspense>
  );
}
