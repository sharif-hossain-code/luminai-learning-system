import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getLearnerCourse, lessonHref, stepHref } from '@/lib/learning';

export const metadata: Metadata = { title: 'Resume course' };

type Params = Promise<{ slug: string }>;

/** /learn/<course>: opens the lesson or quiz to resume (or the first lesson once everything is done). */
async function Resume({ params }: { params: Params }): Promise<null> {
  const { slug } = await params;
  const access = await getLearnerCourse(slug);
  if (!access) notFound();
  if (access.state === 'not-enrolled') redirect(`/courses/${slug}`);
  const { course } = access;
  if (course.nextLesson) redirect(stepHref(course.slug, course.nextLesson));
  const first = course.modules[0]?.lessons[0]?.id;
  if (!first) redirect(`/courses/${course.slug}`);
  redirect(lessonHref(course.slug, first));
}

export default function ResumePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="p-8 text-fg-muted">Opening your course…</p>}>
      <Resume params={params} />
    </Suspense>
  );
}
