import 'server-only';
import {
  enrolledCourseSchema,
  learnerCourseSchema,
  learnerLessonSchema,
  type EnrolledCourse,
  type LearnerCourse,
  type LearnerLesson,
} from '@luminai/contracts';
import { z } from 'zod';
import { ServerApiError, serverGet } from './server-api';

const data =
  <T extends z.ZodType>(schema: T) =>
  (body: unknown): z.output<T> =>
    schema.parse(z.object({ data: z.unknown() }).parse(body).data);

/** The learner's view of a course: enrolled, not enrolled, or not found (null). */
export type CourseAccess =
  { state: 'enrolled'; course: LearnerCourse } | { state: 'not-enrolled' } | null;

export async function getLearnerCourse(idOrSlug: string): Promise<CourseAccess> {
  try {
    const course = await serverGet(
      `/courses/${encodeURIComponent(idOrSlug)}/learning`,
      data(learnerCourseSchema),
    );
    return { state: 'enrolled', course };
  } catch (error) {
    if (error instanceof ServerApiError && error.code === 'NOT_ENROLLED') {
      return { state: 'not-enrolled' };
    }
    if (error instanceof ServerApiError && error.status === 404) return null;
    throw error;
  }
}

export type LessonAccess =
  { state: 'open'; lesson: LearnerLesson } | { state: 'locked' } | { state: 'not-enrolled' } | null;

export async function getLesson(lessonId: string): Promise<LessonAccess> {
  try {
    return {
      state: 'open',
      lesson: await serverGet(
        `/lessons/${encodeURIComponent(lessonId)}`,
        data(learnerLessonSchema),
      ),
    };
  } catch (error) {
    if (error instanceof ServerApiError) {
      if (error.code === 'LESSON_LOCKED') return { state: 'locked' };
      if (error.code === 'NOT_ENROLLED') return { state: 'not-enrolled' };
      if (error.status === 404 || error.status === 422) return null;
    }
    throw error;
  }
}

export function getMyCourses(status?: 'in-progress' | 'completed'): Promise<EnrolledCourse[]> {
  const query = status ? `?status=${status}` : '';
  return serverGet(`/users/me/enrollments${query}`, data(z.array(enrolledCourseSchema)));
}

export function getContinueLearning(): Promise<EnrolledCourse | null> {
  return serverGet('/users/me/continue-learning', data(enrolledCourseSchema.nullable()));
}

/** Where a course's lessons live in the web app. */
export const lessonHref = (slug: string, lessonId: string) => `/learn/${slug}/${lessonId}`;
