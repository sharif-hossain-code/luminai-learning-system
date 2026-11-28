import type { CatalogCourse } from '@luminai/contracts';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import {
  categoryAccent,
  formatDuration,
  formatDurationLong,
  LEVEL_LABELS,
  plural,
} from '@/lib/course-format';

export function CourseMeta({
  items,
  className,
}: {
  items: { text: string; label?: string }[];
  className?: string;
}) {
  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-fg-muted',
        className,
      )}
    >
      {items.map((item, index) => (
        <span key={item.text} className="flex items-center gap-2.5">
          {index > 0 ? <span aria-hidden>·</span> : null}
          {item.label ? (
            <>
              <span aria-hidden>{item.text}</span>
              <span className="sr-only">{item.label}</span>
            </>
          ) : (
            item.text
          )}
        </span>
      ))}
    </p>
  );
}

export function CategoryChip({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-full px-3 text-caption font-medium',
        categoryAccent(slug).chip,
        className,
      )}
    >
      {name}
    </span>
  );
}

/** Catalogue card. The whole card is clickable through the title link's stretched hit area. */
export function CourseCard({ course }: { course: CatalogCourse }) {
  const accent = categoryAccent(course.category.slug);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-subtle bg-surface transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:border-default hover:shadow-soft focus-within:border-default">
      <div className={cn('flex h-24 items-end justify-between p-4 sm:h-[132px]', accent.tint)}>
        <CategoryChip slug={course.category.slug} name={course.category.name} />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <h3 className="text-h3 font-semibold">
          <Link
            href={`/courses/${course.slug}`}
            className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-focus-within:underline group-focus-within:decoration-2 group-focus-within:underline-offset-4"
          >
            {course.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-support text-fg-muted">{course.summary}</p>
        <CourseMeta
          className="mt-auto pt-1"
          items={[
            { text: LEVEL_LABELS[course.level] },
            {
              text: formatDuration(course.estimatedMinutes),
              label: formatDurationLong(course.estimatedMinutes),
            },
            { text: plural(course.lessonCount, 'lesson') },
          ]}
        />
      </div>
    </article>
  );
}
