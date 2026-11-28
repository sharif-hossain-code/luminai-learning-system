import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@luminai/database';
import { hashIp } from '../common/client-ip.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';

export type AuditAction =
  | 'auth.registered'
  | 'auth.email_verified'
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.logout_others'
  | 'auth.session_revoked'
  | 'auth.password_reset_requested'
  | 'auth.password_reset'
  | 'auth.password_changed'
  | 'admin.user_role_changed'
  | 'admin.user_status_changed'
  | 'category.created'
  | 'category.updated'
  | 'course.created'
  | 'course.deleted'
  | 'course.owner_changed'
  | 'course.submitted_for_review'
  | 'course.returned_to_draft'
  | 'course.published'
  | 'course.archived';

export interface AuditInput {
  action: AuditAction;
  actorUserId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  /** Never put passwords, tokens or full email addresses here. */
  metadata?: Prisma.InputJsonObject;
  ip?: string;
}

type Db = Prisma.TransactionClient | PrismaService['client'];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Records an event. Pass a transaction client to make it part of a transaction. */
  async record(input: AuditInput, db: Db = this.prisma.client): Promise<void> {
    await db.auditEvent.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? {},
        ipHash: hashIp(input.ip, this.config.SESSION_SECRET),
      },
    });
  }

  /** For events that must never fail the request (e.g. failed sign-in attempts). */
  async recordQuietly(input: AuditInput): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      this.logger.error(
        `Could not record audit event ${input.action}: ${error instanceof Error ? error.name : 'error'}`,
      );
    }
  }
}
