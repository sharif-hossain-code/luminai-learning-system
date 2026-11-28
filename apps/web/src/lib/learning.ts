import 'server-only';
import {
  attemptSchema,
  enrolledCourseSchema,
  learnerAssessmentSchema,
  learnerCourseSchema,
  learnerLessonSchema,
  upNextAssessmentSchema,
  type Attempt,
  type EnrolledCourse,
  type LearnerAssessment,
  type LearnerCourse,
  type LearnerLesson,
  type UpNextAssessment,
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

export function getUpNext(): Promise<UpNextAssessment[]> {
  return serverGet('/users/me/up-next', data(z.array(upNextAssessmentSchema)));
}

export type AssessmentAccess =
  | { state: 'open'; assessment: LearnerAssessment }
  | { state: 'locked' }
  | { state: 'not-enrolled' }
  | null;

export async function getAssessment(assessmentId: string): Promise<AssessmentAccess> {
  try {
    return {
      state: 'open',
      assessment: await serverGet(
        `/assessments/${encodeURIComponent(assessmentId)}`,
        data(learnerAssessmentSchema),
      ),
    };
  } catch (error) {
    if (error instanceof ServerApiError) {
      if (error.code === 'ASSESSMENT_LOCKED') return { state: 'locked' };
      if (error.code === 'NOT_ENROLLED') return { state: 'not-enrolled' };
      if (error.status === 404 || error.status === 422) return null;
    }
    throw error;
  }
}

/** One of the learner's attempts, or null (not theirs, or unknown). */
export async function getAttempt(attemptId: string): Promise<Attempt | null> {
  try {
    return await serverGet(`/attempts/${encodeURIComponent(attemptId)}`, data(attemptSchema));
  } catch (error) {
    if (error instanceof ServerApiError && (error.status === 404 || error.status === 422)) {
      return null;
    }
    throw error;
  }
}

export { assessmentHref, attemptHref, lessonHref, stepHref } from './learning-links';
