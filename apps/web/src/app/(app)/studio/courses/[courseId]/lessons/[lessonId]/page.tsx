import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LessonEditor } from '@/components/studio/lesson-editor';
import { getStudioCourse, orNotFound } from '@/lib/studio-data';

export const metadata: Metadata = { title: 'Edit lesson' };

type Params = Promise<{ courseId: string; lessonId: string }>;

async function Editor({ params }: { params: Params }) {
  const { courseId, lessonId } = await params;
  const course = await orNotFound(getStudioCourse(courseId));
  const exists = course.modules.some((module) => module.lessons.some((l) => l.id === lessonId));
  if (!exists) notFound();
  return <LessonEditor key={lessonId} initial={course} lessonId={lessonId} />;
}

export default function EditLessonPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="h-96 animate-pulse rounded-lg bg-subtle">
          <span className="sr-only">Loading lesson…</span>
        </div>
      }
    >
      <Editor params={params} />
    </Suspense>
  );
}
