import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CSRF_HEADER, CSRF_HEADER_VALUE, ErrorCode } from '@luminai/contracts';
import type { FastifyRequest } from 'fastify';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { AppError } from './app-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests, in two layers on top of
 * SameSite=Lax cookies:
 * 1. State-changing requests must send a custom header. Browsers can't add one
 *    cross-site without a CORS preflight, which our exact-origin CORS refuses.
 * 2. If the browser sends an Origin header, it must be the web app's origin.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowedOrigin = new URL(config.WEB_URL).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    const originOk = origin === undefined || origin === this.allowedOrigin;
    const headerOk = request.headers[CSRF_HEADER] === CSRF_HEADER_VALUE;
    if (!originOk || !headerOk) {
      throw new AppError(
        ErrorCode.CSRF_CHECK_FAILED,
        HttpStatus.FORBIDDEN,
        'The request was blocked by cross-site request protection.',
      );
    }
    return true;
  }
}
