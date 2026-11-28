import type { CatalogCourse } from '@luminai/contracts';
import { ButtonLink } from '@/components/ui/button';
import {
  categoryAccent,
  formatDuration,
  formatDurationLong,
  LEVEL_LABELS,
  plural,
} from '@/lib/course-format';
import { CategoryChip, CourseMeta } from './course-card';
import { DomainArt } from './domain-art';

/** The first featured course, shown large above the grid when no filters are applied. */
export function FeaturedCourse({ course }: { course: CatalogCourse }) {
  return (
    <section
      aria-labelledby="featured-title"
      className="flex flex-col overflow-hidden rounded-lg border border-subtle bg-surface sm:flex-row"
    >
      <DomainArt slug={course.category.slug} className="min-h-48 sm:min-h-60 sm:flex-[1_1_40%]" />
      <div className="flex min-w-0 flex-col gap-3 p-6 sm:flex-[1_1_60%] sm:p-8">
        <div className="flex flex-wrap gap-2">
          <CategoryChip
            slug={course.category.slug}
            name={course.category.name}
            className={categoryAccent(course.category.slug).tint}
          />
          <span className="inline-flex h-7 items-center rounded-full bg-warning-subtle px-3 text-caption font-medium text-warning-text">
            Featured
          </span>
        </div>
        <h2 id="featured-title" className="text-[1.625rem] leading-[2.125rem] font-semibold">
          {course.title}
        </h2>
        <p className="text-body text-fg-muted sm:text-base sm:leading-6">{course.summary}</p>
        <CourseMeta
          items={[
            { text: LEVEL_LABELS[course.level] },
            {
              text: formatDuration(course.estimatedMinutes),
              label: formatDurationLong(course.estimatedMinutes),
            },
            { text: plural(course.moduleCount, 'module') },
          ]}
        />
        <div className="mt-1">
          <ButtonLink href={`/courses/${course.slug}`}>
            View course<span className="sr-only">: {course.title}</span>
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
