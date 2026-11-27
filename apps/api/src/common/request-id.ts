import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept a caller-supplied ID (e.g. from the web server or a load balancer) only
// if it is short and safe to log; otherwise generate a fresh one.
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function resolveRequestId(request: IncomingMessage): string {
  const incoming = request.headers[REQUEST_ID_HEADER];
  if (typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)) {
    return incoming;
  }
  return `req_${randomUUID().replaceAll('-', '')}`;
}
