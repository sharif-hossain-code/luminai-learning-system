import { SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { normalizeEmail } from '../identity/email-normalization.js';

export interface RateLimitRule {
  /** Name used in the Redis key, e.g. "login:ip". */
  name: string;
  limit: number;
  windowSeconds: number;
  /** Returns the bucket key for this request, or null to skip the rule. */
  key: (request: FastifyRequest) => string | null;
}

export const RATE_LIMIT_RULES = 'rateLimit:rules';

export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_RULES, rules);

/** Bucket by client IP (respects TRUST_PROXY). */
export const byIp = (request: FastifyRequest): string => request.ip;

/** Bucket by the normalized email in the JSON body, if there is one. */
export const byBodyEmail = (request: FastifyRequest): string | null => {
  const email = (request.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.length <= 254 ? normalizeEmail(email) : null;
};

/** Bucket by the signed-in user. */
export const byUser = (request: FastifyRequest): string | null => request.auth?.userId ?? null;
