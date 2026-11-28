import type { CatalogCourseDetail } from '@luminai/contracts';
import { ArrowLeft, Check, Clock, Layers, Signal } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { categoryAccent, formatDurationLong, LEVEL_LABELS, plural } from '@/lib/course-format';
import { CategoryChip } from './course-card';
import { CourseOutline } from './course-outline';
import { DomainArt } from './domain-art';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-h2 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex max-w-[68ch] flex-col gap-3 text-base leading-7 text-fg">
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
    </div>
  );
}

/**
 * The course page learners see before enrolling. Also used by the studio preview,
 * which passes its own banner and action.
 */
export function CourseDetail({
  course,
  action,
  banner,
  backHref = '/courses',
  backLabel = 'All courses',
}: {
  course: CatalogCourseDetail;
  action: ReactNode;
  banner?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const accent = categoryAccent(course.category.slug);
  const facts = [
    { icon: Clock, label: 'Time', value: formatDurationLong(course.estimatedMinutes) },
    { icon: Signal, label: 'Level', value: LEVEL_LABELS[course.level] },
    {
      icon: Layers,
      label: 'Content',
      value: `${plural(course.moduleCount, 'module')}, ${plural(course.lessonCount, 'lesson')}`,
    },
  ];
  const updated = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(course.publishedAt),
  );

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-support font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {backLabel}
      </Link>
      {banner}

      <header className="overflow-hidden rounded-lg border border-subtle bg-surface">
        <div className="grid md:grid-cols-[1fr_minmax(240px,36%)]">
          <div className="flex flex-col gap-4 p-6 sm:p-8">
            <div className="flex flex-wrap gap-2">
              <CategoryChip
                slug={course.category.slug}
                name={course.category.name}
                className={accent.tint}
              />
            </div>
            <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold tracking-tight sm:text-[2.25rem] sm:leading-[2.75rem]">
              {course.title}
            </h1>
            <p className="max-w-[60ch] text-base leading-7 text-fg-muted">{course.summary}</p>
            <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
              {facts.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2 text-support">
                  <Icon aria-hidden className={cn('size-4', accent.text)} />
                  <dt className="sr-only">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <DomainArt
            slug={course.category.slug}
            className="hidden min-h-56 md:flex"
            iconClassName="size-24"
          />
        </div>
      </header>

      <div className="mt-2 grid items-start gap-8 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-10">
          <Section id="outcomes-heading" title="What you’ll learn">
            <ul className="grid gap-3 sm:grid-cols-2">
              {course.outcomes.map((outcome) => (
                <li
                  key={outcome}
                  className="flex gap-3 rounded-md border border-subtle bg-surface p-4"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-text">
                    <Check aria-hidden className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-body">{outcome}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="about-heading" title="About this course">
            <Paragraphs text={course.description} />
          </Section>

          <Section id="outline-heading" title="Course outline">
            <CourseOutline modules={course.modules} />
          </Section>
        </div>

        <aside aria-label="Enrolment" className="flex flex-col gap-5 lg:sticky lg:top-8">
          <div className="flex flex-col gap-4 rounded-lg border border-subtle bg-surface p-5 shadow-xs">
            {action}
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-surface p-5">
            <h2 className="text-support font-semibold">Before you start</h2>
            {course.prerequisites.length ? (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-support text-fg-muted">
                {course.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-support text-fg-muted">No prior knowledge needed.</p>
            )}
            <p className="mt-2 border-t border-subtle pt-3 text-caption text-fg-subtle">
              Version {course.version} · Updated {updated}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
