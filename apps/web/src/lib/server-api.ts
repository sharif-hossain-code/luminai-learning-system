import 'server-only';
import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE_NAMES } from './session';
import { apiBaseUrl } from './server-env';

/** An API error seen while rendering on the server. */
export class ServerApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed (${status})`);
  }
}

/**
 * GET from the API on behalf of the signed-in user (forwards the session cookie).
 * Returns the parsed body. 401/403/404 become ServerApiError so pages can react.
 */
export async function serverGet<T>(path: string, parse: (body: unknown) => T): Promise<T> {
  const jar = await cookies();
  const cookieHeader = SESSION_COOKIE_NAMES.flatMap((name) => {
    const value = jar.get(name)?.value;
    return value ? [`${name}=${value}`] : [];
  }).join('; ');
  const forwardedFor = (await headers()).get('x-forwarded-for');
  const response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
    headers: {
      accept: 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new ServerApiError(response.status);
  return parse(await response.json());
}
