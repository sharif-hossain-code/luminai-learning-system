import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { RoleCode } from '@luminai/database';
import type { FastifyRequest } from 'fastify';

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: RoleCode;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export const IS_PUBLIC = 'identity:isPublic';
export const REQUIRED_ROLES = 'identity:requiredRoles';

/** The route needs no session. Every other route requires one. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The signed-in user must have one of these roles (checked server-side). */
export const Roles = (...roles: RoleCode[]) => SetMetadata(REQUIRED_ROLES, roles);

/** The authenticated user's context. Only valid on non-public routes. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.auth) {
      throw new Error('CurrentAuth used on a route without authentication');
    }
    return request.auth;
  },
);
