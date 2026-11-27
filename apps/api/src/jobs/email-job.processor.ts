import { Inject, Injectable, Logger } from '@nestjs/common';
import { UserStatus } from '@luminai/database';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { EMAIL_TRANSPORT, type EmailTransport } from '../email/email.transport.js';
import {
  accountExistsEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
} from '../email/templates.js';
import { generateOpaqueToken, hashToken } from '../identity/tokens.js';
import type { EmailJob } from './email-jobs.js';

/**
 * Does the work behind each email job. Runs in the worker process (or inline in tests).
 * Each handler re-checks the user's state, so a stale or repeated job is harmless.
 */
@Injectable()
export class EmailJobProcessor {
  private readonly logger = new Logger(EmailJobProcessor.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    @Inject(EMAIL_TRANSPORT) private readonly email: EmailTransport,
  ) {}

  async process(job: EmailJob): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: job.userId },
      select: { id: true, email: true, status: true, profile: { select: { displayName: true } } },
    });
    if (!user) {
      this.logger.warn(`Skipping ${job.type}: user no longer exists`);
      return;
    }
    const displayName = user.profile?.displayName ?? null;

    switch (job.type) {
      case 'verify-email': {
        if (user.status !== UserStatus.PENDING_VERIFICATION) return;
        const token = await this.issueToken('verify', user.id);
        const url = this.link('/verify-email', token);
        await this.email.send(
          verificationEmail(user.email, displayName, url, this.config.EMAIL_VERIFICATION_TTL_HOURS),
        );
        return;
      }
      case 'password-reset': {
        if (user.status !== UserStatus.ACTIVE) return;
        const token = await this.issueToken('reset', user.id);
        const url = this.link('/reset-password', token);
        await this.email.send(
          passwordResetEmail(user.email, displayName, url, this.config.PASSWORD_RESET_TTL_MINUTES),
        );
        return;
      }
      case 'account-exists':
        await this.email.send(
          accountExistsEmail(
            user.email,
            displayName,
            this.link('/sign-in'),
            this.link('/forgot-password'),
          ),
        );
        return;
      case 'password-changed':
        await this.email.send(
          passwordChangedEmail(user.email, displayName, this.link('/forgot-password')),
        );
        return;
    }
  }

  /** Invalidates the user's unused links of this kind and issues a fresh one. */
  private async issueToken(kind: 'verify' | 'reset', userId: string): Promise<string> {
    const token = generateOpaqueToken();
    const now = new Date();
    if (kind === 'verify') {
      const expiresAt = new Date(
        now.getTime() + this.config.EMAIL_VERIFICATION_TTL_HOURS * 3_600_000,
      );
      await this.prisma.client.$transaction([
        this.prisma.client.emailVerificationToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        }),
        this.prisma.client.emailVerificationToken.create({
          data: { userId, tokenHash: hashToken(token), expiresAt },
        }),
      ]);
    } else {
      const expiresAt = new Date(now.getTime() + this.config.PASSWORD_RESET_TTL_MINUTES * 60_000);
      await this.prisma.client.$transaction([
        this.prisma.client.passwordResetToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        }),
        this.prisma.client.passwordResetToken.create({
          data: { userId, tokenHash: hashToken(token), expiresAt },
        }),
      ]);
    }
    return token;
  }

  private link(path: string, token?: string): string {
    const url = new URL(path, this.config.WEB_URL);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }
}
