import { z } from 'zod';
import { errorEnvelopeSchema } from './errors.js';
import {
  adminCategorySchema,
  adminCourseSchema,
  adminCoursesQuerySchema,
  adminCourseSummarySchema,
  catalogCourseDetailSchema,
  catalogCourseSchema,
  catalogQuerySchema,
  categorySchema,
  courseSnapshotSchema,
  courseVersionSummarySchema,
  createCategoryRequestSchema,
  createCourseRequestSchema,
  createLessonRequestSchema,
  createModuleRequestSchema,
  createResourceRequestSchema,
  reorderRequestSchema,
  updateCategoryRequestSchema,
  updateCourseRequestSchema,
  updateLessonRequestSchema,
  updateModuleRequestSchema,
  updateResourceRequestSchema,
} from './catalog.js';
import { livenessResponseSchema, readinessResponseSchema } from './health.js';
import {
  acceptedResponseSchema,
  adminListUsersQuerySchema,
  adminUpdateRoleRequestSchema,
  adminUpdateStatusRequestSchema,
  adminUserSchema,
  changePasswordRequestSchema,
  currentUserSchema,
  dataEnvelope,
  emailOnlyRequestSchema,
  loginRequestSchema,
  paginationSchema,
  preferencesSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  sessionSummarySchema,
  updatePreferencesRequestSchema,
  updateProfileRequestSchema,
  verifyEmailRequestSchema,
} from './identity.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** `editor` means content editors and administrators (ownership is checked per course). */
export type RouteAuth = 'public' | 'session' | 'editor' | 'admin';

export interface ApiRoute {
  method: HttpMethod;
  /** Path below /api/v1, with `{param}` placeholders. */
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  auth: RouteAuth;
  body?: z.ZodType;
  query?: z.ZodObject;
  /** Success status and body; omit the schema for an empty (204) response. */
  success: { status: number; schema?: z.ZodType };
  errors?: number[];
}

/**
 * Every public API route. The API's tests fail if a Nest route is missing here
 * (or listed here but not implemented), which keeps docs/api/openapi.json honest.
 */
export const API_ROUTES: ApiRoute[] = [
  {
    method: 'GET',
    path: '/health/live',
    operationId: 'healthLive',
    summary: 'Liveness probe',
    tag: 'Health',
    auth: 'public',
    success: { status: 200, schema: livenessResponseSchema },
  },
  {
    method: 'GET',
    path: '/health/ready',
    operationId: 'healthReady',
    summary: 'Readiness probe (503 when degraded)',
    tag: 'Health',
    auth: 'public',
    success: { status: 200, schema: readinessResponseSchema },
    errors: [503],
  },
  {
    method: 'POST',
    path: '/auth/register',
    operationId: 'register',
    summary:
      'Create an account. Always answers 202 so the response never reveals whether the email is registered.',
    tag: 'Auth',
    auth: 'public',
    body: registerRequestSchema,
    success: { status: 202, schema: dataEnvelope(acceptedResponseSchema) },
    errors: [422, 429],
  },
  {
    method: 'POST',
    path: '/auth/verify-email',
    operationId: 'verifyEmail',
    summary: 'Verify an email address with a one-time token',
    tag: 'Auth',
    auth: 'public',
    body: verifyEmailRequestSchema,
    success: { status: 204 },
    errors: [400, 422, 429],
  },
  {
    method: 'POST',
    path: '/auth/resend-verification',
    operationId: 'resendVerification',
    summary: 'Send a new verification email if the account is still unverified (always 202)',
    tag: 'Auth',
    auth: 'public',
    body: emailOnlyRequestSchema,
    success: { status: 202, schema: dataEnvelope(acceptedResponseSchema) },
    errors: [422, 429],
  },
  {
    method: 'POST',
    path: '/auth/login',
    operationId: 'login',
    summary: 'Sign in and receive a session cookie',
    tag: 'Auth',
    auth: 'public',
    body: loginRequestSchema,
    success: { status: 200, schema: dataEnvelope(currentUserSchema) },
    errors: [401, 403, 422, 429],
  },
  {
    method: 'POST',
    path: '/auth/logout',
    operationId: 'logout',
    summary: 'Sign out of this session',
    tag: 'Auth',
    auth: 'session',
    success: { status: 204 },
    errors: [401, 403],
  },
  {
    method: 'POST',
    path: '/auth/logout-all',
    operationId: 'logoutAll',
    summary: 'Sign out of every session',
    tag: 'Auth',
    auth: 'session',
    success: { status: 204 },
    errors: [401, 403],
  },
  {
    method: 'POST',
    path: '/auth/sessions/revoke-others',
    operationId: 'revokeOtherSessions',
    summary: 'Sign out of every session except this one',
    tag: 'Auth',
    auth: 'session',
    success: { status: 204 },
    errors: [401, 403],
  },
  {
    method: 'POST',
    path: '/auth/forgot-password',
    operationId: 'forgotPassword',
    summary: 'Send a password reset link if the account exists (always 202)',
    tag: 'Auth',
    auth: 'public',
    body: emailOnlyRequestSchema,
    success: { status: 202, schema: dataEnvelope(acceptedResponseSchema) },
    errors: [422, 429],
  },
  {
    method: 'POST',
    path: '/auth/reset-password',
    operationId: 'resetPassword',
    summary: 'Set a new password with a one-time token; signs out every session',
    tag: 'Auth',
    auth: 'public',
    body: resetPasswordRequestSchema,
    success: { status: 204 },
    errors: [400, 422, 429],
  },
  {
    method: 'POST',
    path: '/auth/change-password',
    operationId: 'changePassword',
    summary: 'Change password; signs out other sessions and rotates this one',
    tag: 'Auth',
    auth: 'session',
    body: changePasswordRequestSchema,
    success: { status: 200, schema: dataEnvelope(currentUserSchema) },
    errors: [401, 403, 422, 429],
  },
  {
    method: 'GET',
    path: '/auth/sessions',
    operationId: 'listSessions',
    summary: 'List my active sessions',
    tag: 'Auth',
    auth: 'session',
    success: { status: 200, schema: dataEnvelope(z.array(sessionSummarySchema)) },
    errors: [401],
  },
  {
    method: 'DELETE',
    path: '/auth/sessions/{sessionId}',
    operationId: 'revokeSession',
    summary: 'Sign out one of my sessions',
    tag: 'Auth',
    auth: 'session',
    success: { status: 204 },
    errors: [401, 403, 404],
  },
  {
    method: 'GET',
    path: '/users/me',
    operationId: 'getMe',
    summary: 'Get my account and profile',
    tag: 'Users',
    auth: 'session',
    success: { status: 200, schema: dataEnvelope(currentUserSchema) },
    errors: [401],
  },
  {
    method: 'PATCH',
    path: '/users/me/profile',
    operationId: 'updateMyProfile',
    summary: 'Update my profile',
    tag: 'Users',
    auth: 'session',
    body: updateProfileRequestSchema,
    success: { status: 200, schema: dataEnvelope(currentUserSchema) },
    errors: [401, 403, 422],
  },
  {
    method: 'GET',
    path: '/users/me/preferences',
    operationId: 'getMyPreferences',
    summary: 'Get my learning preferences',
    tag: 'Users',
    auth: 'session',
    success: { status: 200, schema: dataEnvelope(preferencesSchema.partial()) },
    errors: [401],
  },
  {
    method: 'PATCH',
    path: '/users/me/preferences',
    operationId: 'updateMyPreferences',
    summary: 'Update my learning preferences',
    tag: 'Users',
    auth: 'session',
    body: updatePreferencesRequestSchema,
    success: { status: 200, schema: dataEnvelope(preferencesSchema.partial()) },
    errors: [401, 403, 422],
  },
  {
    method: 'GET',
    path: '/admin/users',
    operationId: 'adminListUsers',
    summary: 'Search users (administrators only)',
    tag: 'Admin',
    auth: 'admin',
    query: adminListUsersQuerySchema,
    success: {
      status: 200,
      schema: z.object({ data: z.array(adminUserSchema), pagination: paginationSchema }),
    },
    errors: [401, 403],
  },
  {
    method: 'PATCH',
    path: '/admin/users/{userId}/role',
    operationId: 'adminUpdateUserRole',
    summary: "Change a user's role (audited)",
    tag: 'Admin',
    auth: 'admin',
    body: adminUpdateRoleRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminUserSchema) },
    errors: [401, 403, 404, 409, 422],
  },
  {
    method: 'PATCH',
    path: '/admin/users/{userId}/status',
    operationId: 'adminUpdateUserStatus',
    summary: 'Suspend or reactivate a user (audited; suspending signs them out)',
    tag: 'Admin',
    auth: 'admin',
    body: adminUpdateStatusRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminUserSchema) },
    errors: [401, 403, 404, 409, 422],
  },
  // ---------- Catalogue (public) ----------
  {
    method: 'GET',
    path: '/catalog/categories',
    operationId: 'catalogCategories',
    summary: 'Active categories, in display order',
    tag: 'Catalogue',
    auth: 'public',
    success: { status: 200, schema: dataEnvelope(z.array(categorySchema)) },
  },
  {
    method: 'GET',
    path: '/catalog/courses',
    operationId: 'catalogCourses',
    summary: 'Search and filter published courses',
    tag: 'Catalogue',
    auth: 'public',
    query: catalogQuerySchema,
    success: {
      status: 200,
      schema: z.object({ data: z.array(catalogCourseSchema), pagination: paginationSchema }),
    },
    errors: [422],
  },
  {
    method: 'GET',
    path: '/catalog/courses/{courseIdOrSlug}',
    operationId: 'catalogCourse',
    summary: 'A published course with its outline (no lesson content)',
    tag: 'Catalogue',
    auth: 'public',
    success: { status: 200, schema: dataEnvelope(catalogCourseDetailSchema) },
    errors: [404],
  },
  // ---------- Content authoring ----------
  {
    method: 'GET',
    path: '/admin/categories',
    operationId: 'adminListCategories',
    summary: 'All categories, including inactive ones',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(z.array(adminCategorySchema)) },
    errors: [401, 403],
  },
  {
    method: 'POST',
    path: '/admin/categories',
    operationId: 'adminCreateCategory',
    summary: 'Create a category (administrators only, audited)',
    tag: 'Content',
    auth: 'admin',
    body: createCategoryRequestSchema,
    success: { status: 201, schema: dataEnvelope(adminCategorySchema) },
    errors: [401, 403, 409, 422],
  },
  {
    method: 'PATCH',
    path: '/admin/categories/{categoryId}',
    operationId: 'adminUpdateCategory',
    summary: 'Rename, reorder or deactivate a category (administrators only, audited)',
    tag: 'Content',
    auth: 'admin',
    body: updateCategoryRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminCategorySchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'GET',
    path: '/admin/courses',
    operationId: 'adminListCourses',
    summary: 'Courses you can edit (administrators see every course)',
    tag: 'Content',
    auth: 'editor',
    query: adminCoursesQuerySchema,
    success: {
      status: 200,
      schema: z.object({ data: z.array(adminCourseSummarySchema), pagination: paginationSchema }),
    },
    errors: [401, 403],
  },
  {
    method: 'POST',
    path: '/admin/courses',
    operationId: 'adminCreateCourse',
    summary: 'Start a new course draft owned by you',
    tag: 'Content',
    auth: 'editor',
    body: createCourseRequestSchema,
    success: { status: 201, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 409, 422],
  },
  {
    method: 'GET',
    path: '/admin/courses/{courseId}',
    operationId: 'adminGetCourse',
    summary: 'The working copy of a course, with its modules, lessons and publish checks',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404],
  },
  {
    method: 'PATCH',
    path: '/admin/courses/{courseId}',
    operationId: 'adminUpdateCourse',
    summary: 'Edit course details. Owner and featured rank are for administrators only.',
    tag: 'Content',
    auth: 'editor',
    body: updateCourseRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 409, 422],
  },
  {
    method: 'DELETE',
    path: '/admin/courses/{courseId}',
    operationId: 'adminDeleteCourse',
    summary: 'Delete a course that has never been published',
    tag: 'Content',
    auth: 'editor',
    success: { status: 204 },
    errors: [401, 403, 404, 409],
  },
  {
    method: 'GET',
    path: '/admin/courses/{courseId}/preview',
    operationId: 'adminPreviewCourse',
    summary: 'The working copy in published form, including lesson content',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(courseSnapshotSchema) },
    errors: [401, 403, 404],
  },
  {
    method: 'POST',
    path: '/admin/courses/{courseId}/submit-for-review',
    operationId: 'adminSubmitCourseForReview',
    summary: 'Ask for the course to be published (fails with the publish issues if incomplete)',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 409, 422],
  },
  {
    method: 'POST',
    path: '/admin/courses/{courseId}/return-to-draft',
    operationId: 'adminReturnCourseToDraft',
    summary: 'Withdraw a review request',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 409],
  },
  {
    method: 'POST',
    path: '/admin/courses/{courseId}/publish',
    operationId: 'adminPublishCourse',
    summary: 'Publish the working copy as a new immutable version (administrators only, audited)',
    tag: 'Content',
    auth: 'admin',
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 409, 422],
  },
  {
    method: 'POST',
    path: '/admin/courses/{courseId}/archive',
    operationId: 'adminArchiveCourse',
    summary: 'Withdraw a course from the catalogue (administrators only, audited)',
    tag: 'Content',
    auth: 'admin',
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 409],
  },
  {
    method: 'GET',
    path: '/admin/courses/{courseId}/versions',
    operationId: 'adminListCourseVersions',
    summary: 'Published versions of a course, newest first',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(z.array(courseVersionSummarySchema)) },
    errors: [401, 403, 404],
  },
  {
    method: 'POST',
    path: '/admin/courses/{courseId}/modules',
    operationId: 'adminCreateModule',
    summary: 'Add a module at the end of the course',
    tag: 'Content',
    auth: 'editor',
    body: createModuleRequestSchema,
    success: { status: 201, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'PUT',
    path: '/admin/courses/{courseId}/module-order',
    operationId: 'adminReorderModules',
    summary: 'Set the module order (must list every module of the course exactly once)',
    tag: 'Content',
    auth: 'editor',
    body: reorderRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'PATCH',
    path: '/admin/modules/{moduleId}',
    operationId: 'adminUpdateModule',
    summary: 'Edit a module',
    tag: 'Content',
    auth: 'editor',
    body: updateModuleRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'DELETE',
    path: '/admin/modules/{moduleId}',
    operationId: 'adminDeleteModule',
    summary: 'Delete a module and its lessons from the working copy',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404],
  },
  {
    method: 'POST',
    path: '/admin/modules/{moduleId}/lessons',
    operationId: 'adminCreateLesson',
    summary: 'Add a lesson at the end of a module',
    tag: 'Content',
    auth: 'editor',
    body: createLessonRequestSchema,
    success: { status: 201, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'PUT',
    path: '/admin/modules/{moduleId}/lesson-order',
    operationId: 'adminReorderLessons',
    summary: 'Set the lesson order (must list every lesson of the module exactly once)',
    tag: 'Content',
    auth: 'editor',
    body: reorderRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'PATCH',
    path: '/admin/lessons/{lessonId}',
    operationId: 'adminUpdateLesson',
    summary: 'Edit a lesson, including its structured content',
    tag: 'Content',
    auth: 'editor',
    body: updateLessonRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'DELETE',
    path: '/admin/lessons/{lessonId}',
    operationId: 'adminDeleteLesson',
    summary: 'Delete a lesson from the working copy',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404],
  },
  {
    method: 'POST',
    path: '/admin/lessons/{lessonId}/resources',
    operationId: 'adminCreateResource',
    summary: 'Attach a resource (an https link that passes the safe URL policy)',
    tag: 'Content',
    auth: 'editor',
    body: createResourceRequestSchema,
    success: { status: 201, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'PATCH',
    path: '/admin/resources/{resourceId}',
    operationId: 'adminUpdateResource',
    summary: 'Edit a resource',
    tag: 'Content',
    auth: 'editor',
    body: updateResourceRequestSchema,
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404, 422],
  },
  {
    method: 'DELETE',
    path: '/admin/resources/{resourceId}',
    operationId: 'adminDeleteResource',
    summary: 'Remove a resource',
    tag: 'Content',
    auth: 'editor',
    success: { status: 200, schema: dataEnvelope(adminCourseSchema) },
    errors: [401, 403, 404],
  },
];

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad request or invalid token',
  401: 'Not signed in, or wrong credentials',
  403: 'Forbidden, or CSRF check failed',
  404: 'Not found',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Rate limited',
  503: 'Service unavailable',
};

function toSchema(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Builds the OpenAPI 3.1 document from API_ROUTES. */
export function buildOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of API_ROUTES) {
    const parameters: unknown[] = [];
    for (const match of route.path.matchAll(/\{(\w+)\}/g)) {
      parameters.push({
        name: match[1],
        in: 'path',
        required: true,
        schema: match[1]?.endsWith('IdOrSlug')
          ? { type: 'string' }
          : { type: 'string', format: 'uuid' },
      });
    }
    if (route.query) {
      const shape = route.query.shape as Record<string, z.ZodType>;
      for (const [name, schema] of Object.entries(shape)) {
        parameters.push({ name, in: 'query', required: false, schema: toSchema(schema, 'input') });
      }
    }

    const responses: Record<string, unknown> = {
      [route.success.status]: route.success.schema
        ? {
            description: 'Success',
            content: { 'application/json': { schema: toSchema(route.success.schema, 'output') } },
          }
        : { description: 'Success (no content)' },
    };
    for (const status of route.errors ?? []) {
      responses[status] = {
        description: STATUS_TEXT[status] ?? 'Error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
      };
    }

    const operation: Record<string, unknown> = {
      operationId: route.operationId,
      summary: route.summary,
      tags: [route.tag],
      security: route.auth === 'public' ? [] : [{ sessionCookie: [] }],
      ...(parameters.length ? { parameters } : {}),
      ...(route.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: toSchema(route.body, 'input') } },
            },
          }
        : {}),
      responses,
    };
    if (route.auth === 'admin') operation['x-required-role'] = 'ADMIN';
    if (route.auth === 'editor') operation['x-required-role'] = ['CONTENT_EDITOR', 'ADMIN'];

    const pathItem = (paths[route.path] ??= {});
    pathItem[route.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Luminai Learning System API',
      version: '1.0.0',
      description:
        'All state-changing requests must send the `x-luminai-csrf: 1` header. ' +
        'Authenticated requests use the HttpOnly session cookie set by POST /auth/login.',
    },
    servers: [{ url: '/api/v1' }],
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'luminai_session' },
      },
      schemas: { ErrorEnvelope: toSchema(errorEnvelopeSchema, 'output') },
    },
  };
}
