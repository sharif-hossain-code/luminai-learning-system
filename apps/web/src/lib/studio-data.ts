import 'server-only';
import {
  adminCategorySchema,
  adminCourseSchema,
  adminCourseSummarySchema,
  adminUserSchema,
  courseSnapshotSchema,
  courseVersionSummarySchema,
  paginationSchema,
} from '@luminai/contracts';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ServerApiError, serverGet } from './server-api';

/** Unwraps the API's `{ data }` envelope. */
const data =
  <T extends z.ZodType>(schema: T) =>
  (body: unknown): z.output<T> =>
    schema.parse(z.object({ data: z.unknown() }).parse(body).data);

export const getStudioCourses = (params: URLSearchParams) =>
  serverGet(`/admin/courses?${params.toString()}`, (body) =>
    z.object({ data: z.array(adminCourseSummarySchema), pagination: paginationSchema }).parse(body),
  );

export const getStudioCourse = (courseId: string) =>
  serverGet(`/admin/courses/${encodeURIComponent(courseId)}`, data(adminCourseSchema));

export const getStudioPreview = (courseId: string) =>
  serverGet(`/admin/courses/${encodeURIComponent(courseId)}/preview`, data(courseSnapshotSchema));

export const getStudioVersions = (courseId: string) =>
  serverGet(
    `/admin/courses/${encodeURIComponent(courseId)}/versions`,
    data(z.array(courseVersionSummarySchema)),
  );

export const getStudioCategories = () =>
  serverGet('/admin/categories', data(z.array(adminCategorySchema)));

/** Editors and administrators who can own a course (administrators only). */
export const getCourseOwners = async () => {
  const users = await serverGet(
    '/admin/users?pageSize=100',
    (body) => z.object({ data: z.array(adminUserSchema) }).parse(body).data,
  );
  return users.filter((user) => user.role !== 'LEARNER' && user.status === 'ACTIVE');
};

/**
 * 403, 404 and 422 (a malformed id) all read as "not found": editors shouldn't learn
 * which other people's courses exist.
 */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ServerApiError && [403, 404, 422].includes(error.status)) notFound();
    throw error;
  }
}
