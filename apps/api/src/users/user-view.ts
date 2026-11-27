import { type CurrentUser, type Preferences, preferencesSchema } from '@luminai/contracts';
import type { Prisma } from '@luminai/database';

export const userViewSelect = {
  id: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  role: { select: { code: true } },
  profile: {
    select: {
      displayName: true,
      locale: true,
      timezone: true,
      learningGoals: true,
      avatarObjectKey: true,
      preferences: true,
    },
  },
} satisfies Prisma.UserSelect;

export type UserViewRow = Prisma.UserGetPayload<{ select: typeof userViewSelect }>;

/** Reads stored preferences defensively: unknown or invalid keys are dropped. */
export function parsePreferences(value: unknown): Partial<Preferences> {
  const result = preferencesSchema.partial().safeParse(value ?? {});
  if (result.success) return result.data;
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries((value ?? {}) as Record<string, unknown>)) {
    const single = preferencesSchema.partial().safeParse({ [key]: item });
    if (single.success) Object.assign(cleaned, single.data);
  }
  return cleaned;
}

/** The only shape in which a user leaves the API. Never includes the password hash. */
export function toCurrentUser(row: UserViewRow): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role.code,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    profile: {
      displayName: row.profile?.displayName ?? null,
      locale: row.profile?.locale ?? 'en',
      timezone: row.profile?.timezone ?? 'UTC',
      learningGoals: (row.profile?.learningGoals ?? []).filter(
        (goal): goal is CurrentUser['profile']['learningGoals'][number] =>
          goal === 'language' || goal === 'communication' || goal === 'leadership',
      ),
      avatarObjectKey: row.profile?.avatarObjectKey ?? null,
    },
    preferences: parsePreferences(row.profile?.preferences),
  };
}
