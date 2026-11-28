import { z } from 'zod';

/**
 * Stable, machine-readable error codes returned by the API.
 * Clients should branch on `code`, never on `message`.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Identity-specific codes.
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  CSRF_CHECK_FAILED: 'CSRF_CHECK_FAILED',
  // Content-specific codes.
  /** fieldErrors list what to fix; `field` is the issue path (course.summary, lesson:<id> ...). */
  PUBLISH_VALIDATION_FAILED: 'PUBLISH_VALIDATION_FAILED',
  // Learning-specific codes.
  /** The learner must enrol in the course before opening its lessons. */
  NOT_ENROLLED: 'NOT_ENROLLED',
  /** The lesson's module opens after the required modules before it are complete. */
  LESSON_LOCKED: 'LESSON_LOCKED',
  /** The lesson's completion rule isn't met yet (e.g. the media hasn't been played to the end). */
  COMPLETION_RULE_NOT_MET: 'COMPLETION_RULE_NOT_MET',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const fieldErrorSchema = z.object({
  /** Dot-separated path to the invalid field, e.g. `profile.displayName`. */
  field: z.string(),
  message: z.string(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;

/** The single error shape every API endpoint returns. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    fieldErrors: z.array(fieldErrorSchema),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
