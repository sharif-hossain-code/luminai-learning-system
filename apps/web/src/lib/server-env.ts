import 'server-only';

/**
 * Server-only configuration. Never import this from a Client Component:
 * the `server-only` import makes that a build error.
 */
export function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:4000';
}
