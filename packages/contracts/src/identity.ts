import { z } from 'zod';

/** Kept in sync with the server policy in apps/api (identity/password-policy.ts). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const LEARNING_DOMAINS = ['language', 'communication', 'leadership'] as const;
export const learningDomainSchema = z.enum(LEARNING_DOMAINS);
export type LearningDomain = z.infer<typeof learningDomainSchema>;

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const skillLevelSchema = z.enum(SKILL_LEVELS);

export const PRACTICE_FREQUENCIES = ['daily', 'few_times_week', 'weekly', 'occasionally'] as const;
export const practiceFrequencySchema = z.enum(PRACTICE_FREQUENCIES);

export const ROLE_CODES = ['LEARNER', 'CONTENT_EDITOR', 'ADMIN'] as const;
export const roleCodeSchema = z.enum(ROLE_CODES);
export type RoleCodeValue = z.infer<typeof roleCodeSchema>;

export const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ error: 'Enter a valid email address.' }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

const opaqueTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'This link is invalid.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(80, 'Use at most 80 characters.');

// ---------- Requests ----------

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
  acceptTerms: z.literal(true, { error: 'You need to accept the terms to continue.' }),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const verifyEmailRequestSchema = z.object({ token: opaqueTokenSchema });
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const emailOnlyRequestSchema = z.object({ email: emailSchema });
export type EmailOnlyRequest = z.infer<typeof emailOnlyRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  // Not checked against the policy here: old passwords may predate a policy change.
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: opaqueTokenSchema,
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const updateProfileRequestSchema = z
  .object({
    displayName: displayNameSchema.nullable(),
    locale: z.string().min(2).max(35),
    timezone: z.string().min(1).max(64),
    learningGoals: z.array(learningDomainSchema).max(LEARNING_DOMAINS.length),
  })
  .partial()
  .strict();
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const preferencesSchema = z
  .object({
    levels: z.partialRecord(learningDomainSchema, skillLevelSchema),
    practiceFrequency: practiceFrequencySchema.nullable(),
    onboardingCompletedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;

export const updatePreferencesRequestSchema = preferencesSchema.partial().strict();
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;

export const adminUpdateRoleRequestSchema = z.object({ role: roleCodeSchema }).strict();
export const adminUpdateStatusRequestSchema = z
  .object({ status: z.enum(['ACTIVE', 'SUSPENDED']) })
  .strict();

export const adminListUsersQuerySchema = z.object({
  q: z.string().trim().max(254).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- Responses ----------

export const profileSchema = z.object({
  displayName: z.string().nullable(),
  locale: z.string(),
  timezone: z.string(),
  learningGoals: z.array(learningDomainSchema),
  avatarObjectKey: z.string().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: roleCodeSchema,
  status: userStatusSchema,
  emailVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  profile: profileSchema,
  preferences: preferencesSchema.partial(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const sessionSummarySchema = z.object({
  id: z.uuid(),
  device: z.string(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime().nullable(),
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const acceptedResponseSchema = z.object({ status: z.literal('accepted') });

export const adminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: roleCodeSchema,
  status: userStatusSchema,
  displayName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const paginationSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

/** Wraps a success payload in the standard `{ data }` envelope. */
export function dataEnvelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema });
}

/** Header that state-changing requests must send (CSRF defence, see docs/security). */
export const CSRF_HEADER = 'x-luminai-csrf';
export const CSRF_HEADER_VALUE = '1';
