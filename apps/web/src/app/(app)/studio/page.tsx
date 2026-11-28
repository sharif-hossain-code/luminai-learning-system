import { COURSE_STATUSES, type AdminCourseSummary } from '@luminai/contracts';
import { FolderCog, LibraryBig } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ChangesBadge, StatusBadge } from '@/components/studio/status-badge';
import { NewCourseButton } from '@/components/studio/new-course-button';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { LEVEL_LABELS, plural, STATUS_LABELS } from '@/lib/course-format';
import { getCurrentUser } from '@/lib/session';
import { getStudioCategories, getStudioCourses } from '@/lib/studio-data';

export const metadata: Metadata = { title: 'Course studio' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(iso));
}

function CourseRow({ course, showOwner }: { course: AdminCourseSummary; showOwner: boolean }) {
  return (
    <li className="relative grid gap-x-6 gap-y-2 border-b border-subtle px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-raised sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/studio/courses/${course.id}`}
            className="text-body font-semibold after:absolute after:inset-0 after:content-[''] hover:text-primary"
          >
            {course.title}
          </Link>
          <StatusBadge status={course.status} />
          {course.hasUnpublishedChanges ? <ChangesBadge /> : null}
        </div>
        <p className="mt-1 text-caption text-fg-muted">
          {course.category.name} · {LEVEL_LABELS[course.level]} ·{' '}
          {plural(course.moduleCount, 'module')}, {plural(course.lessonCount, 'lesson')}
          {course.liveVersion ? ` · Live version ${course.liveVersion}` : ''}
        </p>
      </div>
      <p className="text-caption text-fg-muted sm:text-right">
        {showOwner ? (
          <span className="block">{course.owner.displayName ?? course.owner.email}</span>
        ) : null}
        Edited {relativeDate(course.updatedAt)}
      </p>
    </li>
  );
}

async function Studio({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const status =
    typeof raw.status === 'string' && (COURSE_STATUSES as readonly string[]).includes(raw.status)
      ? raw.status
      : undefined;
  const params = new URLSearchParams({ pageSize: '100', ...(status ? { status } : {}) });
  const user = await getCurrentUser();
  // The layout shows learners an explanation instead; don't ask the API for nothing.
  if (!user || user.role === 'LEARNER') return null;
  const [courses, categories] = await Promise.all([
    getStudioCourses(params),
    getStudioCategories(),
  ]);
  const isAdmin = user?.role === 'ADMIN';
  const tabs = [
    { value: undefined, label: 'All' },
    ...COURSE_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
  ];

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[2rem] leading-10 font-semibold">Course studio</h1>
          <p className="mt-2 max-w-xl text-fg-muted">
            {isAdmin
              ? 'Every course on the platform. Review submissions and publish when they’re ready.'
              : 'Your courses. Submit a course for review when it’s ready, and an administrator publishes it.'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
          {isAdmin ? (
            <ButtonLink href="/studio/categories" variant="secondary">
              <FolderCog aria-hidden className="size-4" />
              Categories
            </ButtonLink>
          ) : null}
          <NewCourseButton categories={categories.filter((category) => category.isActive)} />
        </div>
      </header>

      <nav
        aria-label="Filter by status"
        className="mt-8 flex gap-1 overflow-x-auto border-b border-subtle"
      >
        {tabs.map((tab) => {
          const active = tab.value === status;
          return (
            <Link
              key={tab.label}
              href={tab.value ? `/studio?status=${tab.value}` : '/studio'}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3 pb-3 text-support font-medium whitespace-nowrap transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {courses.data.length ? (
        <ul className="mt-6 overflow-hidden rounded-lg border border-subtle bg-surface">
          {courses.data.map((course) => (
            <CourseRow key={course.id} course={course} showOwner={isAdmin} />
          ))}
        </ul>
      ) : (
        <div className="mt-6 flex flex-col items-center rounded-lg border border-dashed border-default bg-surface px-6 py-14 text-center">
          <LibraryBig aria-hidden className="size-8 text-fg-subtle" />
          <h2 className="mt-4 text-h3 font-semibold">
            {status
              ? `No ${STATUS_LABELS[status as keyof typeof STATUS_LABELS].toLowerCase()} courses`
              : 'No courses yet'}
          </h2>
          <p className="mt-1 max-w-sm text-support text-fg-muted">
            {status
              ? 'Courses appear here as they move through review and publishing.'
              : 'Start a draft with a working title. You can shape the details and lessons afterwards.'}
          </p>
        </div>
      )}
    </>
  );
}

export default function StudioPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-subtle" />}>
      <Studio searchParams={searchParams} />
    </Suspense>
  );
}
