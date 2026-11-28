import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.schema.js';

/**
 * In production the `__Host-` prefix makes browsers reject the cookie unless it is
 * Secure, has Path=/ and no Domain, so a subdomain can't overwrite it.
 */
export function sessionCookieName(config: Pick<AppConfig, 'NODE_ENV'>): string {
  return config.NODE_ENV === 'production' ? '__Host-luminai_session' : 'luminai_session';
}

export function readSessionCookie(request: FastifyRequest, config: AppConfig): string | undefined {
  const value = request.cookies?.[sessionCookieName(config)];
  return value && /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : undefined;
}

export function setSessionCookie(
  reply: FastifyReply,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  void reply.setCookie(sessionCookieName(config), token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  void reply.clearCookie(sessionCookieName(config), {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
