import type { CatalogCourseDetail, CourseSnapshot } from '@luminai/contracts';
import { Eye } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CourseDetail } from '@/components/catalog/course-detail';
import { LessonContent } from '@/components/content/lesson-content';
import { StatusBadge } from '@/components/studio/status-badge';
import { ButtonLink } from '@/components/ui/button';
import { formatDuration, LESSON_TYPES, RESOURCE_TYPE_LABELS } from '@/lib/course-format';
import { getStudioCourse, getStudioPreview, orNotFound } from '@/lib/studio-data';

export const metadata: Metadata = { title: 'Preview course' };

type Params = Promise<{ courseId: string }>;

/** The working copy, shaped like the catalogue page learners would see once it is published. */
function toDetail(
  snapshot: CourseSnapshot,
  meta: { category: CatalogCourseDetail['category']; version: number; featured: boolean },
): CatalogCourseDetail {
  const { course, modules } = snapshot;
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    summary: course.summary || 'No summary yet.',
    description: course.description || 'No description yet.',
    outcomes: course.outcomes,
    prerequisites: course.prerequisites,
    level: course.level,
    estimatedMinutes: course.estimatedMinutes,
    category: meta.category,
    featured: meta.featured,
    version: meta.version,
    publishedAt: new Date().toISOString(),
    moduleCount: modules.length,
    lessonCount: modules.reduce((sum, module) => sum + module.lessons.length, 0),
    modules: modules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      lessons: module.lessons.map(({ id, title, type, estimatedMinutes }) => ({
        id,
        title,
        type,
        estimatedMinutes,
      })),
    })),
  };
}

async function Preview({ params }: { params: Params }) {
  const { courseId } = await params;
  const [course, snapshot] = await Promise.all([
    orNotFound(getStudioCourse(courseId)),
    orNotFound(getStudioPreview(courseId)),
  ]);
  const detail = toDetail(snapshot, {
    category: course.category,
    version:
      (course.liveVersion ?? 0) + (course.hasUnpublishedChanges || !course.liveVersion ? 1 : 0),
    featured: course.featuredRank !== null,
  });
  const editHref = `/studio/courses/${course.id}`;

  return (
    <div className="flex flex-col gap-12">
      <CourseDetail
        course={detail}
        backHref={editHref}
        backLabel="Back to editor"
        banner={
          <div
            role="note"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-subtle px-4 py-3 text-support text-primary-strong"
          >
            <span className="flex items-center gap-2">
              <Eye aria-hidden className="size-4" />
              Preview of the working copy, shown as learners will see it once it is published.
            </span>
            <StatusBadge status={course.status} />
          </div>
        }
        action={
          <>
            <p className="text-support text-fg-muted">Learners will see an enrol button here.</p>
            <ButtonLink href={editHref} variant="secondary">
              Keep editing
            </ButtonLink>
          </>
        }
      />

      <section
        aria-labelledby="lessons-heading"
        className="mx-auto flex w-full max-w-[1080px] flex-col gap-6"
      >
        <div>
          <h2 id="lessons-heading" className="text-h2 font-semibold">
            Lesson content
          </h2>
          <p className="mt-1 text-support text-fg-muted">
            Shown here so you can read every lesson. Learners only see it after they enrol.
          </p>
        </div>
        {snapshot.modules.map((module, moduleIndex) => (
          <div key={module.id} className="flex flex-col gap-4">
            <h3 className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
              Module {moduleIndex + 1} · {module.title}
            </h3>
            {module.lessons.map((lesson) => {
              const type = LESSON_TYPES[lesson.type];
              return (
                <article
                  key={lesson.id}
                  aria-labelledby={`lesson-${lesson.id}`}
                  className="rounded-lg border border-subtle bg-surface p-5 sm:p-8"
                >
                  <header className="mb-5 flex flex-col gap-1 border-b border-subtle pb-4">
                    <p className="flex items-center gap-1.5 text-caption text-fg-muted">
                      <type.icon aria-hidden className="size-3.5" />
                      {type.label} · {formatDuration(lesson.estimatedMinutes)}
                    </p>
                    <h4 id={`lesson-${lesson.id}`} className="text-h3 font-semibold">
                      {lesson.title}
                    </h4>
                  </header>
                  {lesson.objectives.length ? (
                    <div className="mb-5 rounded-md bg-subtle px-4 py-3">
                      <p className="text-caption font-semibold text-fg-muted">In this lesson</p>
                      <ul className="mt-1 list-disc pl-5 text-support">
                        {lesson.objectives.map((objective) => (
                          <li key={objective}>{objective}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {lesson.content.blocks.length ? (
                    <LessonContent content={lesson.content} />
                  ) : (
                    <p className="text-support text-fg-subtle">No written content.</p>
                  )}
                  {lesson.resources.length ? (
                    <ul className="mt-6 flex flex-col gap-2 border-t border-subtle pt-4">
                      {lesson.resources.map((resource) => (
                        <li key={resource.id} className="text-support">
                          <span className="text-fg-muted">
                            {RESOURCE_TYPE_LABELS[resource.type]}:{' '}
                          </span>
                          {resource.externalUrl ? (
                            <a
                              href={resource.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="font-medium text-primary underline-offset-2 hover:underline"
                            >
                              {resource.title}
                            </a>
                          ) : (
                            resource.title
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}

export default function PreviewCoursePage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="h-96 animate-pulse rounded-lg bg-subtle">
          <span className="sr-only">Loading preview…</span>
        </div>
      }
    >
      <Preview params={params} />
    </Suspense>
  );
}
