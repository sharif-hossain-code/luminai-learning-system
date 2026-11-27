import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  changePasswordRequestSchema,
  emailOnlyRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
  type ChangePasswordRequest,
  type CurrentUser,
  type EmailOnlyRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SessionSummary,
  type VerifyEmailRequest,
} from '@luminai/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { byBodyEmail, byIp, byUser, RateLimit } from '../rate-limit/rate-limit.js';
import { type AuthContext, CurrentAuth, Public } from './auth-context.js';
import { AuthService, type RequestMeta } from './auth.service.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';
import { SessionService } from './session.service.js';

const MINUTE = 60;
const HOUR = 3600;
const accepted = { data: { status: 'accepted' as const } };

function meta(request: FastifyRequest): RequestMeta {
  return { ip: request.ip, userAgent: request.headers['user-agent'] };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit(
    { name: 'register:ip', limit: 10, windowSeconds: HOUR, key: byIp },
    { name: 'register:email', limit: 3, windowSeconds: HOUR, key: byBodyEmail },
  )
  async register(
    @Body({ schema: registerRequestSchema }) body: RegisterRequest,
    @Req() request: FastifyRequest,
  ) {
    await this.auth.register(body, meta(request));
    return accepted;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: 'verify:ip', limit: 20, windowSeconds: 15 * MINUTE, key: byIp })
  async verifyEmail(
    @Body({ schema: verifyEmailRequestSchema }) body: VerifyEmailRequest,
    @Req() request: FastifyRequest,
  ) {
    await this.auth.verifyEmail(body.token, meta(request));
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit(
    { name: 'resend:ip', limit: 10, windowSeconds: HOUR, key: byIp },
    { name: 'resend:email', limit: 1, windowSeconds: MINUTE, key: byBodyEmail },
  )
  async resendVerification(@Body({ schema: emailOnlyRequestSchema }) body: EmailOnlyRequest) {
    await this.auth.resendVerification(body.email);
    return accepted;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(
    { name: 'login:ip', limit: 50, windowSeconds: 15 * MINUTE, key: byIp },
    { name: 'login:email', limit: 10, windowSeconds: 15 * MINUTE, key: byBodyEmail },
  )
  async login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: CurrentUser }> {
    const result = await this.auth.login(body.email, body.password, meta(request));
    setSessionCookie(reply, this.config, result.session.token, result.session.expiresAt);
    return { data: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logout(auth.userId, auth.sessionId, meta(request));
    clearSessionCookie(reply, this.config);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.logoutAll(auth.userId, meta(request));
    clearSessionCookie(reply, this.config);
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOtherSessions(@CurrentAuth() auth: AuthContext, @Req() request: FastifyRequest) {
    await this.auth.logoutOthers(auth.userId, auth.sessionId, meta(request));
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit(
    { name: 'forgot:ip', limit: 10, windowSeconds: HOUR, key: byIp },
    { name: 'forgot:email', limit: 1, windowSeconds: MINUTE, key: byBodyEmail },
  )
  async forgotPassword(
    @Body({ schema: emailOnlyRequestSchema }) body: EmailOnlyRequest,
    @Req() request: FastifyRequest,
  ) {
    await this.auth.requestPasswordReset(body.email, meta(request));
    return accepted;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: 'reset:ip', limit: 10, windowSeconds: 15 * MINUTE, key: byIp })
  async resetPassword(
    @Body({ schema: resetPasswordRequestSchema }) body: ResetPasswordRequest,
    @Req() request: FastifyRequest,
  ) {
    await this.auth.resetPassword(body.token, body.password, meta(request));
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'change-password:user', limit: 5, windowSeconds: 15 * MINUTE, key: byUser })
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body({ schema: changePasswordRequestSchema }) body: ChangePasswordRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: CurrentUser }> {
    const result = await this.auth.changePassword(
      auth.userId,
      auth.sessionId,
      body.currentPassword,
      body.newPassword,
      meta(request),
    );
    setSessionCookie(reply, this.config, result.session.token, result.session.expiresAt);
    return { data: result.user };
  }

  @Get('sessions')
  async listSessions(@CurrentAuth() auth: AuthContext): Promise<{ data: SessionSummary[] }> {
    const sessions = await this.sessions.listActive(auth.userId);
    return {
      data: sessions.map((session) => ({
        id: session.id,
        device: session.userAgent ?? 'Unknown device',
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
        current: session.id === auth.sessionId,
      })),
    };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Param('sessionId', { schema: z.uuid() }) sessionId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.auth.revokeSession(auth.userId, sessionId, meta(request));
    if (sessionId === auth.sessionId) clearSessionCookie(reply, this.config);
  }
}
