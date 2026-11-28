import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type CurrentUser, type RegisterRequest } from '@luminai/contracts';
import { Prisma, RoleCode, UserStatus } from '@luminai/database';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { JobDispatcher } from '../jobs/job-dispatcher.js';
import { toCurrentUser, userViewSelect } from '../users/user-view.js';
import { normalizeEmail } from './email-normalization.js';
import { PasswordHasher } from './password-hasher.js';
import { checkPasswordPolicy } from './password-policy.js';
import { SessionService } from './session.service.js';
import { hashToken } from './tokens.js';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface SignedIn {
  user: CurrentUser;
  session: { token: string; expiresAt: Date };
}

const invalidLink = () =>
  new AppError(
    ErrorCode.TOKEN_INVALID,
    HttpStatus.BAD_REQUEST,
    'This link is invalid or has expired.',
  );
const invalidCredentials = () =>
  new AppError(
    ErrorCode.INVALID_CREDENTIALS,
    HttpStatus.UNAUTHORIZED,
    'Email or password is incorrect.',
  );

function weakPassword(message: string, field: string): AppError {
  return new AppError(ErrorCode.WEAK_PASSWORD, HttpStatus.UNPROCESSABLE_ENTITY, message, [
    { field, message },
  ]);
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly jobs: JobDispatcher,
  ) {}

  /**
   * Creates a pending account and sends a verification email. If the email is
   * already registered, the existing owner gets a heads-up email instead; the
   * caller sees the same response either way.
   */
  async register(input: RegisterRequest, meta: RequestMeta): Promise<void> {
    const email = normalizeEmail(input.email);
    const policy = checkPasswordPolicy(input.password, email, input.displayName);
    if (!policy.ok) throw weakPassword(policy.message ?? 'Choose a stronger password.', 'password');

    const existing = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === UserStatus.PENDING_VERIFICATION) {
        await this.jobs.dispatchEmail({ type: 'verify-email', userId: existing.id });
      } else if (existing.status === UserStatus.ACTIVE) {
        await this.jobs.dispatchEmail({ type: 'account-exists', userId: existing.id });
      }
      return;
    }

    const passwordHash = await this.hasher.hash(input.password);
    let userId: string;
    try {
      userId = await this.prisma.client.$transaction(async (tx) => {
        const role = await tx.role.findUniqueOrThrow({
          where: { code: RoleCode.LEARNER },
          select: { id: true },
        });
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            roleId: role.id,
            termsVersion: this.config.TERMS_VERSION,
            termsAcceptedAt: new Date(),
            profile: { create: { displayName: input.displayName ?? null } },
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            action: 'auth.registered',
            actorUserId: user.id,
            resourceType: 'user',
            resourceId: user.id,
            ip: meta.ip,
          },
          tx,
        );
        return user.id;
      });
    } catch (error) {
      // Two sign-ups for the same email at once: the loser behaves like "already registered".
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
    await this.jobs.dispatchEmail({ type: 'verify-email', userId });
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    const now = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true, userId: true, usedAt: true, expiresAt: true },
      });
      if (!record || record.usedAt || record.expiresAt <= now) throw invalidLink();

      // Conditional update: if two requests race, only one consumes the token.
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw invalidLink();

      const activated = await tx.user.updateMany({
        where: { id: record.userId, status: UserStatus.PENDING_VERIFICATION },
        data: { status: UserStatus.ACTIVE, emailVerifiedAt: now },
      });
      if (activated.count !== 1) throw invalidLink();

      await this.audit.record(
        {
          action: 'auth.email_verified',
          actorUserId: record.userId,
          resourceType: 'user',
          resourceId: record.userId,
          ip: meta.ip,
        },
        tx,
      );
    });
  }

  async resendVerification(emailInput: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizeEmail(emailInput) },
      select: { id: true, status: true },
    });
    if (user?.status === UserStatus.PENDING_VERIFICATION) {
      await this.jobs.dispatchEmail({ type: 'verify-email', userId: user.id });
    }
  }

  async login(emailInput: string, password: string, meta: RequestMeta): Promise<SignedIn> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, status: true },
    });

    if (!user || user.status === UserStatus.DELETED) {
      await this.hasher.verifyAgainstDummy(password);
      await this.audit.recordQuietly({
        action: 'auth.login_failed',
        resourceType: 'user',
        metadata: { reason: 'unknown_account' },
        ip: meta.ip,
      });
      throw invalidCredentials();
    }
    if (!(await this.hasher.verify(user.passwordHash, password))) {
      await this.audit.recordQuietly({
        action: 'auth.login_failed',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { reason: 'wrong_password' },
        ip: meta.ip,
      });
      throw invalidCredentials();
    }
    // Account state is only revealed once the password is proven.
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new AppError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        HttpStatus.FORBIDDEN,
        'Confirm your email address before signing in.',
      );
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new AppError(
        ErrorCode.ACCOUNT_SUSPENDED,
        HttpStatus.FORBIDDEN,
        'This account is suspended. Contact support for help.',
      );
    }

    if (this.hasher.needsRehash(user.passwordHash)) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.hasher.hash(password) },
      });
    }

    const session = await this.sessions.create(user.id, meta.userAgent);
    await this.audit.record({
      action: 'auth.login_succeeded',
      actorUserId: user.id,
      resourceType: 'session',
      resourceId: session.sessionId,
      ip: meta.ip,
    });
    return { user: await this.currentUser(user.id), session };
  }

  async logout(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(sessionId, userId);
    await this.audit.record({
      action: 'auth.logout',
      actorUserId: userId,
      resourceType: 'session',
      resourceId: sessionId,
      ip: meta.ip,
    });
  }

  async logoutAll(userId: string, meta: RequestMeta): Promise<void> {
    const count = await this.sessions.revokeAll(userId);
    await this.audit.record({
      action: 'auth.logout_all',
      actorUserId: userId,
      resourceType: 'user',
      resourceId: userId,
      metadata: { sessions: count },
      ip: meta.ip,
    });
  }

  async logoutOthers(userId: string, currentSessionId: string, meta: RequestMeta): Promise<void> {
    const count = await this.sessions.revokeAll(userId, { except: currentSessionId });
    await this.audit.record({
      action: 'auth.logout_others',
      actorUserId: userId,
      resourceType: 'user',
      resourceId: userId,
      metadata: { sessions: count },
      ip: meta.ip,
    });
  }

  async revokeSession(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    // Scoped to the owner: another user's session ID behaves exactly like a missing one.
    if (!(await this.sessions.revoke(sessionId, userId))) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, 'Session not found.');
    }
    await this.audit.record({
      action: 'auth.session_revoked',
      actorUserId: userId,
      resourceType: 'session',
      resourceId: sessionId,
      ip: meta.ip,
    });
  }

  async requestPasswordReset(emailInput: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: normalizeEmail(emailInput) },
      select: { id: true, status: true },
    });
    if (user?.status !== UserStatus.ACTIVE) return;
    await this.audit.record({
      action: 'auth.password_reset_requested',
      resourceType: 'user',
      resourceId: user.id,
      ip: meta.ip,
    });
    await this.jobs.dispatchEmail({ type: 'password-reset', userId: user.id });
  }

  async resetPassword(token: string, password: string, meta: RequestMeta): Promise<void> {
    const now = new Date();
    const record = await this.prisma.client.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true, status: true } },
      },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= now ||
      record.user.status !== UserStatus.ACTIVE
    )
      throw invalidLink();

    const policy = checkPasswordPolicy(password, record.user.email);
    if (!policy.ok) throw weakPassword(policy.message ?? 'Choose a stronger password.', 'password');
    const passwordHash = await this.hasher.hash(password);

    await this.prisma.client.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw invalidLink();
      // Any other outstanding reset links stop working too.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.user.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: record.user.id },
        data: { passwordHash, passwordChangedAt: now },
      });
      await this.sessions.revokeAll(record.user.id, {}, tx);
      await this.audit.record(
        {
          action: 'auth.password_reset',
          actorUserId: record.user.id,
          resourceType: 'user',
          resourceId: record.user.id,
          ip: meta.ip,
        },
        tx,
      );
    });
    await this.jobs.dispatchEmail({ type: 'password-changed', userId: record.user.id });
  }

  /** Changes the password, signs out every other session and replaces the current one. */
  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<SignedIn> {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        profile: { select: { displayName: true } },
      },
    });
    if (!(await this.hasher.verify(user.passwordHash, currentPassword))) {
      throw new AppError(
        ErrorCode.INVALID_CREDENTIALS,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Your current password is incorrect.',
        [{ field: 'currentPassword', message: 'Your current password is incorrect.' }],
      );
    }
    const policy = checkPasswordPolicy(newPassword, user.email, user.profile?.displayName);
    if (!policy.ok)
      throw weakPassword(policy.message ?? 'Choose a stronger password.', 'newPassword');
    const passwordHash = await this.hasher.hash(newPassword);

    const session = await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await this.sessions.revokeAll(userId, {}, tx);
      const created = await this.sessions.create(userId, meta.userAgent, tx);
      await this.audit.record(
        {
          action: 'auth.password_changed',
          actorUserId: userId,
          resourceType: 'user',
          resourceId: userId,
          metadata: { previousSessionId: currentSessionId },
          ip: meta.ip,
        },
        tx,
      );
      return created;
    });
    await this.jobs.dispatchEmail({ type: 'password-changed', userId });
    return { user: await this.currentUser(userId), session };
  }

  async currentUser(userId: string): Promise<CurrentUser> {
    const row = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: userViewSelect,
    });
    return toCurrentUser(row);
  }
}
