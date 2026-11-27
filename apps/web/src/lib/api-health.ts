import 'server-only';
import { readinessResponseSchema, type ReadinessResponse } from '@luminai/contracts';
import { apiBaseUrl } from './server-env';

export type ApiStatus = { reachable: true; readiness: ReadinessResponse } | { reachable: false };

/** Asks the API whether it is ready. Any failure is reported as "unreachable". */
export async function fetchApiStatus(): Promise<ApiStatus> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const parsed = readinessResponseSchema.safeParse(await response.json());
    return parsed.success ? { reachable: true, readiness: parsed.data } : { reachable: false };
  } catch {
    return { reachable: false };
  }
}
