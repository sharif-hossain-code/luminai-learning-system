import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { EnrolledCourseCard } from '@/components/learning/enrolled-course-card';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { getMyCourses } from '@/lib/learning';

export const metadata: Metadata = { title: 'My learning' };

type Search = Promise<{ status?: string | string[] }>;

/** My learning (Learning.dc.html, 2): enrolled courses, in progress or completed. */
async function MyLearning({ searchParams }: { searchParams: Search }) {
  const { status } = await searchParams;
  const tab = status === 'completed' ? 'completed' : 'in-progress';
  const all = await getMyCourses();
  const inProgress = all.filter((course) => course.enrollment.status === 'ACTIVE');
  const completed = all.filter((course) => course.enrollment.status === 'COMPLETED');
  const shown = tab === 'completed' ? completed : inProgress;

  const tabs = [
    { key: 'in-progress', label: 'In progress', count: inProgress.length, href: '/learning' },
    {
      key: 'completed',
      label: 'Completed',
      count: completed.length,
      href: '/learning?status=completed',
    },
  ] as const;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold">My learning</h1>
          <p className="mt-1 text-fg-muted">Courses you&apos;re enrolled in, most recent first.</p>
        </div>
        {all.length ? (
          <nav
            aria-label="Filter courses"
            className="inline-flex gap-1 rounded-md bg-segmented p-1"
          >
            {tabs.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={tab === item.key ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center rounded-[9px] px-3.5 text-support font-medium',
                  tab === item.key
                    ? 'bg-surface font-semibold text-fg shadow-xs'
                    : 'text-fg-nav hover:text-fg',
                )}
              >
                {item.label} ({item.count})
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {all.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-default p-7">
          <p className="font-semibold">No courses yet</p>
          <p className="text-fg-muted">
            You haven&apos;t enrolled in a course yet. Find one that matches your goals.
          </p>
          <ButtonLink href="/courses">Explore courses</ButtonLink>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-default p-7 text-fg-muted">
          {tab === 'completed'
            ? 'Courses you finish will appear here.'
            : 'Nothing in progress. Pick up something new from the catalogue.'}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((course) => (
            <li key={course.id}>
              <EnrolledCourseCard course={course} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function MyLearningPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="flex w-full max-w-[1080px] flex-col gap-6">
      <Suspense
        fallback={
          <div role="status" className="flex flex-col gap-6">
            <span className="sr-only">Loading your courses…</span>
            <div className="h-10 w-60 animate-pulse rounded-md bg-subtle" />
            <div className="h-48 animate-pulse rounded-lg bg-subtle" />
          </div>
        }
      >
        <MyLearning searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
