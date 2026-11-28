import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AssessmentEditor } from '@/components/studio/assessment-editor';
import { getStudioCourse, orNotFound } from '@/lib/studio-data';

export const metadata: Metadata = { title: 'Edit quiz' };

type Params = Promise<{ courseId: string; assessmentId: string }>;

async function Editor({ params }: { params: Params }) {
  const { courseId, assessmentId } = await params;
  const course = await orNotFound(getStudioCourse(courseId));
  if (!course.assessments.some((assessment) => assessment.id === assessmentId)) notFound();
  return <AssessmentEditor key={assessmentId} initial={course} assessmentId={assessmentId} />;
}

export default function EditAssessmentPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="h-96 animate-pulse rounded-lg bg-subtle">
          <span className="sr-only">Loading quiz…</span>
        </div>
      }
    >
      <Editor params={params} />
    </Suspense>
  );
}
