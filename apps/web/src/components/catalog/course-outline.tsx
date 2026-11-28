import type { CatalogCourseDetail } from '@luminai/contracts';
import { ChevronDown } from 'lucide-react';
import { formatDuration, formatDurationLong, LESSON_TYPES, plural } from '@/lib/course-format';

/** Modules and lessons, as titles only. Shared by the public course page and the studio preview. */
export function CourseOutline({ modules }: { modules: CatalogCourseDetail['modules'] }) {
  return (
    <ol className="flex flex-col gap-3">
      {modules.map((module, index) => {
        const minutes = module.lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0);
        return (
          <li key={module.id}>
            <details open={index < 3} className="group rounded-lg border border-subtle bg-surface">
              <summary className="flex cursor-pointer list-none items-start gap-4 rounded-lg p-5 hover:bg-surface-raised [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-support font-semibold text-primary-strong"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-h3 font-semibold">
                    <span className="sr-only">Module {index + 1}: </span>
                    {module.title}
                  </span>
                  <span className="mt-0.5 block text-caption text-fg-muted">
                    {plural(module.lessons.length, 'lesson')} · {formatDuration(minutes)}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  className="mt-1 size-5 shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="border-t border-subtle px-5 pt-2 pb-4">
                {module.description ? (
                  <p className="pt-2 pb-1 text-support text-fg-muted">{module.description}</p>
                ) : null}
                <ul>
                  {module.lessons.map((lesson) => {
                    const type = LESSON_TYPES[lesson.type];
                    return (
                      <li
                        key={lesson.id}
                        className="flex items-center gap-3 border-b border-subtle py-3 last:border-b-0"
                      >
                        <type.icon aria-hidden className="size-[18px] shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1 text-body">{lesson.title}</span>
                        <span className="sr-only">{type.label},</span>
                        <span className="shrink-0 text-caption text-fg-muted">
                          <span aria-hidden>{formatDuration(lesson.estimatedMinutes)}</span>
                          <span className="sr-only">
                            {formatDurationLong(lesson.estimatedMinutes)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
