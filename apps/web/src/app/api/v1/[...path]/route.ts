import type { NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/server-env';

/**
 * Same-origin proxy to the API. The browser only ever talks to the web app, so the
 * session cookie is first-party and no CORS is needed. The target is read at request
 * time from API_URL, so one build works in every environment.
 */

const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'cookie',
  'origin',
  'user-agent',
  'x-luminai-csrf',
  'x-request-id',
  // Set by the load balancer in front of the web app; the API trusts it only from
  // addresses in TRUST_PROXY (see docs/security/web-security.md).
  'x-forwarded-for',
];

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-request-id', 'cache-control'];

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = new URL(
    `/api/v1/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`,
    apiBaseUrl(),
  );

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      cache: 'no-store',
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is unavailable. Please try again shortly.',
          requestId: 'web-proxy',
          fieldErrors: [],
        },
      },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie())
    responseHeaders.append('set-cookie', cookie);

  const body =
    upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: responseHeaders });
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
