import {
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  errorEnvelopeSchema,
  type FieldError,
} from '@luminai/contracts';

/** An error response from the API, or a network failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldError[] = [],
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The message for one field, if the API reported one. */
  fieldMessage(field: string): string | undefined {
    return this.fieldErrors.find((error) => error.field === field)?.message;
  }
}

const NETWORK_MESSAGE = "We couldn't reach Luminai. Check your connection and try again.";

/**
 * Calls the API through the web app's same-origin `/api/v1` proxy, so the session
 * cookie stays first-party. Unsafe methods send the CSRF header the API requires.
 * Returns the `data` field of the response, or undefined for 204.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET') headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = errorEnvelopeSchema.safeParse(payload);
    const retryAfter = Number(response.headers.get('retry-after'));
    if (parsed.success) {
      const { code, message, fieldErrors } = parsed.data.error;
      throw new ApiError(
        response.status,
        code,
        message,
        fieldErrors,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    }
    throw new ApiError(response.status, 'UNKNOWN', 'Something went wrong. Please try again.');
  }

  return (payload as { data: T } | null)?.data as T;
}
