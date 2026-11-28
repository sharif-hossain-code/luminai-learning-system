import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@luminai/contracts';
import type { RoleCode } from '@luminai/database';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { IS_PUBLIC, REQUIRED_ROLES } from './auth-context.js';
import { readSessionCookie } from './session-cookie.js';
import { SessionService } from './session.service.js';

/**
 * Global guard: every route needs a valid session unless marked @Public().
 * Then, if the route has @Roles(...), the user's role must be one of them.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = readSessionCookie(request, this.config);
    const session = token ? await this.sessions.resolve(token) : null;
    if (!session) {
      throw new AppError(
        ErrorCode.UNAUTHENTICATED,
        HttpStatus.UNAUTHORIZED,
        'You need to sign in to do that.',
      );
    }
    request.auth = session;

    const roles = this.reflector.getAllAndOverride<RoleCode[] | undefined>(REQUIRED_ROLES, targets);
    if (roles?.length && !roles.includes(session.role)) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        HttpStatus.FORBIDDEN,
        'You do not have permission to do that.',
      );
    }
    return true;
  }
}
