import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ContinueCard } from '@/components/learning/continue-card';
import { EnrolledCourseCard } from '@/components/learning/enrolled-course-card';
import { UpNextCard } from '@/components/learning/up-next-card';
import { getMyCourses, getUpNext } from '@/lib/learning';
import { getCurrentUser } from '@/lib/session';
import { SuggestedCourses } from './suggested-courses';
import { GoalsCard } from './welcome';

export const metadata: Metadata = { title: 'Dashboard' };

function today(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone,
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
  }
}

/**
 * Learner dashboard (Dashboard.dc.html): continue learning, up next quizzes, my courses, then
 * suggestions. Weekly goal, mentor and achievement cards arrive with the phases
 * that produce that data, so nothing here is invented.
 */
async function Dashboard() {
  const [user, courses, upNext] = await Promise.all([
    getCurrentUser(),
    getMyCourses().catch(() => null),
    getUpNext().catch(() => []),
  ]);
  const firstName = user?.profile.displayName?.split(' ')[0];
  const enrolled = courses ?? [];
  // Same rule as GET /users/me/continue-learning: most recent unfinished course with a lesson to open.
  const resume = enrolled.find(
    (course) => course.enrollment.status === 'ACTIVE' && course.nextLesson,
  );

  return (
    <>
      <div>
        <p className="text-support text-fg-muted">{today(user?.profile.timezone ?? 'UTC')}</p>
        <h1 className="mt-1 text-[1.875rem] leading-[2.375rem] font-semibold">
          {enrolled.length ? 'Welcome back' : 'Welcome'}
          {firstName ? `, ${firstName}` : ' to Luminai'}
        </h1>
        {enrolled.length === 0 ? (
          <p className="mt-2 text-fg-muted">
            Enrol in a course and your progress will appear here.
          </p>
        ) : null}
      </div>

      {resume ? <ContinueCard course={resume} /> : null}

      <UpNextCard items={upNext} />

      {enrolled.length ? (
        <section aria-labelledby="my-courses-heading" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="my-courses-heading" className="text-h3 font-semibold">
              My courses
            </h2>
            <Link
              href="/learning"
              className="inline-flex items-center gap-1 rounded-sm text-support font-semibold text-primary hover:text-primary-hover"
            >
              View all
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enrolled.slice(0, 3).map((course) => (
              <li key={course.id}>
                <EnrolledCourseCard course={course} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <GoalsCard />
      )}
      {courses === null ? (
        <p className="text-support text-fg-muted">
          We couldn&apos;t load your courses just now. Refresh to try again.
        </p>
      ) : null}

      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-subtle" />}>
        <SuggestedCourses exclude={enrolled.map((course) => course.id)} />
      </Suspense>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex w-full max-w-[1080px] flex-col gap-8">
      <Suspense
        fallback={
          <div role="status" className="flex flex-col gap-6">
            <span className="sr-only">Loading your dashboard…</span>
            <div className="h-10 w-72 animate-pulse rounded-md bg-subtle" />
            <div className="h-40 animate-pulse rounded-lg bg-subtle" />
          </div>
        }
      >
        <Dashboard />
      </Suspense>
    </div>
  );
}
