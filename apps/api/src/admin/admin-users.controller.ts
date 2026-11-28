import { Body, Controller, Get, HttpStatus, Param, Patch, Query, Req } from '@nestjs/common';
import {
  adminListUsersQuerySchema,
  adminUpdateRoleRequestSchema,
  adminUpdateStatusRequestSchema,
  ErrorCode,
} from '@luminai/contracts';
import { Prisma, RoleCode, UserStatus } from '@luminai/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { type AuthContext, CurrentAuth, Roles } from '../identity/auth-context.js';
import { SessionService } from '../identity/session.service.js';

const adminUserSelect = {
  id: true,
  email: true,
  status: true,
  createdAt: true,
  role: { select: { code: true } },
  profile: { select: { displayName: true } },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

function toAdminUser(row: AdminUserRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role.code,
    status: row.status,
    displayName: row.profile?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const notFound = () =>
  new AppError(ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, 'User not found.');

/** Administrator-only user management. Every change is audited in the same transaction. */
@Controller('admin/users')
@Roles(RoleCode.ADMIN)
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  async list(
    @Query({ schema: adminListUsersQuerySchema }) query: z.infer<typeof adminListUsersQuerySchema>,
  ) {
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { email: { contains: query.q.toLowerCase() } },
            { profile: { displayName: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {};
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.user.count({ where }),
    ]);
    return {
      data: rows.map(toAdminUser),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  @Patch(':userId/role')
  async updateRole(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', { schema: z.uuid() }) userId: string,
    @Body({ schema: adminUpdateRoleRequestSchema })
    body: z.infer<typeof adminUpdateRoleRequestSchema>,
    @Req() request: FastifyRequest,
  ) {
    if (userId === auth.userId) {
      throw new AppError(
        ErrorCode.CONFLICT,
        HttpStatus.CONFLICT,
        'You cannot change your own role.',
      );
    }
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { role: { select: { code: true } } },
      });
      if (!before) throw notFound();
      const role = await tx.role.findUniqueOrThrow({
        where: { code: body.role },
        select: { id: true },
      });
      const row = await tx.user.update({
        where: { id: userId },
        data: { roleId: role.id },
        select: adminUserSelect,
      });
      await this.audit.record(
        {
          action: 'admin.user_role_changed',
          actorUserId: auth.userId,
          resourceType: 'user',
          resourceId: userId,
          metadata: { from: before.role.code, to: body.role },
          ip: request.ip,
        },
        tx,
      );
      return row;
    });
    return { data: toAdminUser(updated) };
  }

  @Patch(':userId/status')
  async updateStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', { schema: z.uuid() }) userId: string,
    @Body({ schema: adminUpdateStatusRequestSchema })
    body: z.infer<typeof adminUpdateStatusRequestSchema>,
    @Req() request: FastifyRequest,
  ) {
    if (userId === auth.userId) {
      throw new AppError(
        ErrorCode.CONFLICT,
        HttpStatus.CONFLICT,
        'You cannot change your own account status.',
      );
    }
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!before) throw notFound();
      if (
        before.status === UserStatus.PENDING_VERIFICATION ||
        before.status === UserStatus.DELETED
      ) {
        throw new AppError(
          ErrorCode.CONFLICT,
          HttpStatus.CONFLICT,
          'Only active or suspended accounts can be changed.',
        );
      }
      const row = await tx.user.update({
        where: { id: userId },
        data: { status: body.status },
        select: adminUserSelect,
      });
      if (body.status === UserStatus.SUSPENDED) await this.sessions.revokeAll(userId, {}, tx);
      await this.audit.record(
        {
          action: 'admin.user_status_changed',
          actorUserId: auth.userId,
          resourceType: 'user',
          resourceId: userId,
          metadata: { from: before.status, to: body.status },
          ip: request.ip,
        },
        tx,
      );
      return row;
    });
    return { data: toAdminUser(updated) };
  }
}
