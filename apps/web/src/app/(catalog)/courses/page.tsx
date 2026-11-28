import { SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CatalogFilters } from '@/components/catalog/catalog-filters';
import { CourseCard } from '@/components/catalog/course-card';
import { FeaturedCourse } from '@/components/catalog/featured-course';
import { buttonClasses } from '@/components/ui/button';
import { getCategories, getCourses } from '@/lib/catalog';
import { plural } from '@/lib/course-format';

export const metadata: Metadata = {
  title: 'Explore courses',
  description:
    'Courses in English, communication and leadership, each with clear outcomes, level and time.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const FILTER_KEYS = ['q', 'category', 'level', 'duration', 'sort', 'page'] as const;

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page > 1) next.set('page', String(page));
  else next.delete('page');
  const search = next.toString();
  return search ? `/courses?${search}` : '/courses';
}

async function Catalog({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && value) params.set(key, value);
  }
  const [categories, result] = await Promise.all([getCategories(), getCourses(params)]);
  const { data: courses, pagination } = result;
  const filtered = ['q', 'category', 'level', 'duration'].some((key) => params.has(key));
  const featured =
    !filtered && pagination.page === 1 ? courses.find((course) => course.featured) : undefined;
  const grid = featured ? courses.filter((course) => course.id !== featured.id) : courses;
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));

  return (
    <CatalogFilters categories={categories}>
      <p role="status" className="sr-only">
        {pagination.total === 0
          ? 'No courses found'
          : `${plural(pagination.total, 'course')} found`}
      </p>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-default bg-surface px-6 py-14 text-center">
          <SearchX aria-hidden className="size-8 text-fg-subtle" />
          <h2 className="mt-4 text-h3 font-semibold">No courses match</h2>
          <p className="mt-1 max-w-sm text-support text-fg-muted">
            Try a broader search or fewer filters. New courses are added regularly.
          </p>
          {filtered ? (
            <Link
              href="/courses"
              className={buttonClasses({ variant: 'secondary', className: 'mt-5' })}
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {featured ? <FeaturedCourse course={featured} /> : null}
          {filtered ? (
            <p className="-mb-2 text-support text-fg-muted" aria-hidden>
              {plural(pagination.total, 'course')}
            </p>
          ) : null}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-5">
            {grid.map((course) => (
              <li key={course.id} className="flex">
                <div className="flex w-full">
                  <CourseCard course={course} />
                </div>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center justify-between gap-4">
              {pagination.page > 1 ? (
                <Link
                  href={pageHref(params, pagination.page - 1)}
                  className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-support text-fg-muted">
                Page {pagination.page} of {pages}
              </span>
              {pagination.page < pages ? (
                <Link
                  href={pageHref(params, pagination.page + 1)}
                  className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>
      )}
    </CatalogFilters>
  );
}

function CatalogSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Loading courses…</span>
      <div className="h-[52px] animate-pulse rounded-[14px] bg-subtle" />
      <div className="h-10 w-2/3 animate-pulse rounded-full bg-subtle" />
      <div className="h-60 animate-pulse rounded-lg bg-subtle" />
    </div>
  );
}

export default function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-7">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold">Explore courses</h1>
        <p className="text-base text-fg-muted">
          Every course lists its outcomes, level and expected time before you enrol.
        </p>
      </header>
      <Suspense fallback={<CatalogSkeleton />}>
        <Catalog searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
