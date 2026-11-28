import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CourseEditor } from '@/components/studio/course-editor';
import { getCurrentUser } from '@/lib/session';
import {
  getCourseOwners,
  getStudioCategories,
  getStudioCourse,
  getStudioVersions,
  orNotFound,
} from '@/lib/studio-data';

export const metadata: Metadata = { title: 'Edit course' };

type Params = Promise<{ courseId: string }>;

async function Editor({ params }: { params: Params }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  const [course, categories, versions, owners] = await Promise.all([
    orNotFound(getStudioCourse(courseId)),
    getStudioCategories(),
    orNotFound(getStudioVersions(courseId)),
    user?.role === 'ADMIN' ? getCourseOwners() : Promise.resolve(null),
  ]);
  return (
    <CourseEditor
      initial={course}
      categories={categories}
      initialVersions={versions}
      owners={
        owners?.map((owner) => ({
          id: owner.id,
          label: `${owner.displayName ?? owner.email} (${owner.role === 'ADMIN' ? 'Administrator' : 'Editor'})`,
        })) ?? null
      }
    />
  );
}

export default function EditCoursePage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="h-96 animate-pulse rounded-lg bg-subtle">
          <span className="sr-only">Loading course…</span>
        </div>
      }
    >
      <Editor params={params} />
    </Suspense>
  );
}
