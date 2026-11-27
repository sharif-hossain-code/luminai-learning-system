import { z } from 'zod';
import { errorEnvelopeSchema } from './errors.js';
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
export type RouteAuth = 'public' | 'session' | 'admin';

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
        schema: { type: 'string', format: 'uuid' },
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
