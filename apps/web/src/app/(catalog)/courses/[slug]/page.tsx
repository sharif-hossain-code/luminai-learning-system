import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CourseDetail } from '@/components/catalog/course-detail';
import { EnrolButton } from '@/components/learning/enrol-button';
import { ProgressBar } from '@/components/learning/progress-bar';
import { ButtonLink } from '@/components/ui/button';
import { getCourse } from '@/lib/catalog';
import { plural } from '@/lib/course-format';
import { getLearnerCourse } from '@/lib/learning';
import { getCurrentUser } from '@/lib/session';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await getCourse((await params).slug).catch(() => null);
  return course
    ? { title: course.title, description: course.summary }
    : { title: 'Course not found' };
}

async function EnrolAction({ slug, courseId }: { slug: string; courseId: string }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <p className="text-support text-fg-muted">
          Create a free account to save your progress and get help from your AI mentor.
        </p>
        <ButtonLink href={`/sign-up?next=${encodeURIComponent(`/courses/${slug}`)}`} block>
          Sign up to start
        </ButtonLink>
        <ButtonLink
          href={`/sign-in?next=${encodeURIComponent(`/courses/${slug}`)}`}
          variant="secondary"
          block
        >
          Sign in
        </ButtonLink>
      </>
    );
  }
  const access = await getLearnerCourse(slug);
  if (access?.state !== 'enrolled') {
    return (
      <>
        <p className="text-h3 font-semibold">Free course</p>
        <p className="text-support text-fg-muted">
          Enrol to open the lessons. Your progress saves as you go, on any device.
        </p>
        <EnrolButton courseId={courseId} slug={slug} />
      </>
    );
  }
  const { course } = access;
  if (course.enrollment.status === 'COMPLETED') {
    const finished = course.enrollment.completedAt
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(
          new Date(course.enrollment.completedAt),
        )
      : null;
    return (
      <>
        <p className="text-overline font-semibold tracking-wider text-success-text uppercase">
          Course completed
        </p>
        <ProgressBar percent={100} />
        {finished ? (
          <p className="text-caption font-medium text-success-text">Completed {finished}</p>
        ) : null}
        <ButtonLink href={`/learn/${slug}`} variant="secondary" block>
          Review lessons
        </ButtonLink>
      </>
    );
  }
  return (
    <>
      <p className="text-overline font-semibold tracking-wider text-primary-strong uppercase">
        You&apos;re enrolled
      </p>
      <ProgressBar percent={course.progress.percent} />
      <p className="text-caption text-fg-muted">
        {course.progress.percent}% · {course.progress.completedLessons} of{' '}
        {plural(course.progress.requiredLessons, 'lesson')}
      </p>
      {course.nextLesson ? (
        <p className="text-support">
          <span className="text-fg-muted">Next:</span>{' '}
          <strong className="font-semibold">{course.nextLesson.title}</strong>
        </p>
      ) : null}
      <ButtonLink href={`/learn/${slug}`} block>
        {course.progress.completedLessons === 0 && course.nextLesson?.state === 'NOT_STARTED'
          ? 'Start course'
          : 'Continue learning'}
      </ButtonLink>
    </>
  );
}

async function Course({ params }: { params: Params }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) notFound();
  return (
    <CourseDetail
      course={course}
      action={
        <Suspense fallback={<div className="h-28 animate-pulse rounded-md bg-subtle" />}>
          <EnrolAction slug={course.slug} courseId={course.id} />
        </Suspense>
      }
    />
  );
}

export default function CoursePage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
          <span className="sr-only">Loading course…</span>
          <div className="h-5 w-28 animate-pulse rounded bg-subtle" />
          <div className="h-64 animate-pulse rounded-lg bg-subtle" />
        </div>
      }
    >
      <Course params={params} />
    </Suspense>
  );
}
