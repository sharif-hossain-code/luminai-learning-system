import { Inject, Injectable } from '@nestjs/common';
import { type Prisma, type RoleCode, UserStatus } from '@luminai/database';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { describeDevice } from './device.js';
import { generateOpaqueToken, hashToken } from './tokens.js';

// Refresh last_seen_at at most this often, to avoid a write on every request.
const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  role: RoleCode;
}

type Db = Prisma.TransactionClient | PrismaService['client'];

@Injectable()
export class SessionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  /** Creates a session and returns the raw token (sent once, in the cookie). */
  async create(
    userId: string,
    userAgent: string | undefined,
    db: Db = this.prisma.client,
  ): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const session = await db.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: describeDevice(userAgent),
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });
    return { token, sessionId: session.id, expiresAt };
  }

  /** Looks up a live session for an active user. Returns null for anything else. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
        user: { select: { id: true, status: true, role: { select: { code: true } } } },
      },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
    if (session.user.status !== UserStatus.ACTIVE) return null;

    if (!session.lastSeenAt || now - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
      await this.prisma.client.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }
    return { sessionId: session.id, userId: session.user.id, role: session.user.role.code };
  }

  async revoke(sessionId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.client.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  /** Revokes every live session of the user, optionally keeping one. */
  async revokeAll(
    userId: string,
    options: { except?: string } = {},
    db: Db = this.prisma.client,
  ): Promise<number> {
    const result = await db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.except ? { id: { not: options.except } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  listActive(userId: string) {
    return this.prisma.client.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true },
      take: 50,
    });
  }
}
