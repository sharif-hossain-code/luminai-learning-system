import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CourseDetail } from '@/components/catalog/course-detail';
import { ButtonLink } from '@/components/ui/button';
import { getCourse } from '@/lib/catalog';
import { getCurrentUser } from '@/lib/session';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await getCourse((await params).slug).catch(() => null);
  return course
    ? { title: course.title, description: course.summary }
    : { title: 'Course not found' };
}

async function EnrolAction({ slug }: { slug: string }) {
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
  // Enrolment arrives in Phase 4; until then the course page is browse-only.
  return (
    <>
      <p className="text-h3 font-semibold">Enrolment opens soon</p>
      <p className="text-support text-fg-muted">
        Lessons, progress tracking and mentor help for this course arrive in the next release.
      </p>
      <ButtonLink href="/courses" variant="secondary" block>
        Keep exploring
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
          <EnrolAction slug={course.slug} />
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
