import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { CourseCard } from '@/components/catalog/course-card';
import { getCourses } from '@/lib/catalog';
import { getCurrentUser } from '@/lib/session';

/** Up to three courses from the learner's first goal (or the curated order). */
export async function SuggestedCourses() {
  const user = await getCurrentUser();
  const goal = user?.profile.learningGoals[0];
  const params = new URLSearchParams({ pageSize: '3', ...(goal ? { category: goal } : {}) });
  let { data: courses } = await getCourses(params).catch(() => ({ data: [] }));
  if (courses.length === 0 && goal) {
    ({ data: courses } = await getCourses(new URLSearchParams({ pageSize: '3' })).catch(() => ({
      data: [],
    })));
  }

  return (
    <section aria-labelledby="suggested-heading" className="mt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="suggested-heading" className="text-h3 font-semibold">
            Suggested for you
          </h2>
          <p className="mt-1 text-support text-fg-muted">
            {goal ? 'Picked from your learning goals.' : 'A few places to start.'}
          </p>
        </div>
        <Link
          href="/courses"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-support font-semibold text-primary hover:text-primary-hover"
        >
          Explore all courses
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      {courses.length ? (
        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <li key={course.id} className="flex">
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-default p-6 text-support text-fg-muted">
          No courses are published yet. Check back soon.
        </p>
      )}
    </section>
  );
}
