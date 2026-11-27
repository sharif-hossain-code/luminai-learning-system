import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@luminai/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../common/app-error.js';
import { RATE_LIMIT_RULES, type RateLimitRule } from './rate-limit.js';
import { RateLimitService } from './rate-limit.service.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.get<RateLimitRule[] | undefined>(
      RATE_LIMIT_RULES,
      context.getHandler(),
    );
    if (!rules?.length) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    for (const rule of rules) {
      const key = rule.key(request);
      if (key === null) continue;
      const result = await this.limiter.consume(rule.name, key, rule.limit, rule.windowSeconds);
      if (!result.allowed) {
        void http
          .getResponse<FastifyReply>()
          .header('retry-after', String(result.retryAfterSeconds));
        throw new AppError(
          ErrorCode.RATE_LIMITED,
          HttpStatus.TOO_MANY_REQUESTS,
          'Too many attempts. Please wait a moment and try again.',
        );
      }
    }
    return true;
  }
}
