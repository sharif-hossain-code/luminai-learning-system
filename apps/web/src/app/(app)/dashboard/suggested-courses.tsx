import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { CourseCard } from '@/components/catalog/course-card';
import { getCourses } from '@/lib/catalog';
import { getCurrentUser } from '@/lib/session';

/** Up to three courses from the learner's first goal (or the curated order), minus enrolled ones. */
export async function SuggestedCourses({ exclude = [] }: { exclude?: string[] }) {
  const user = await getCurrentUser();
  const goal = user?.profile.learningGoals[0];
  // Ask for a few extra so courses the learner already takes can be left out.
  const pageSize = String(Math.min(48, 3 + exclude.length));
  const fetchSome = (params: URLSearchParams) =>
    getCourses(params)
      .then(({ data }) => data.filter((course) => !exclude.includes(course.id)).slice(0, 3))
      .catch(() => []);
  let courses = await fetchSome(
    new URLSearchParams({ pageSize, ...(goal ? { category: goal } : {}) }),
  );
  if (courses.length === 0 && goal) courses = await fetchSome(new URLSearchParams({ pageSize }));

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
          {exclude.length
            ? 'You’re enrolled in everything that fits. New courses will appear here.'
            : 'No courses are published yet. Check back soon.'}
        </p>
      )}
    </section>
  );
}
