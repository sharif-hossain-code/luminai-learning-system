import 'server-only';
import { currentUserSchema, type CurrentUser } from '@luminai/contracts';
import { cookies, headers } from 'next/headers';
import { apiBaseUrl } from './server-env';

/** Development and production cookie names (see apps/api identity/session-cookie.ts). */
export const SESSION_COOKIE_NAMES = ['__Host-luminai_session', 'luminai_session'] as const;

/**
 * The signed-in user for this request, or null. Asks the API so a revoked or
 * expired session is never trusted just because the cookie is present.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const cookieHeader = SESSION_COOKIE_NAMES.flatMap((name) => {
    const value = jar.get(name)?.value;
    return value ? [`${name}=${value}`] : [];
  }).join('; ');
  if (!cookieHeader) return null;

  const incoming = await headers();
  const forwardedFor = incoming.get('x-forwarded-for');
  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/users/me`, {
      headers: {
        accept: 'application/json',
        cookie: cookieHeader,
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const parsed = currentUserSchema.safeParse(
      ((await response.json()) as { data?: unknown }).data,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
