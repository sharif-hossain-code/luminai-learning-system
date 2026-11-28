import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  createCategoryRequestSchema,
  ErrorCode,
  updateCategoryRequestSchema,
} from '@luminai/contracts';
import { Prisma, RoleCode } from '@luminai/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { type AuthContext, CurrentAuth, Roles } from '../identity/auth-context.js';

const categorySelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  isActive: true,
  displayOrder: true,
  _count: { select: { courses: true } },
} satisfies Prisma.CategorySelect;

function toAdminCategory(row: Prisma.CategoryGetPayload<{ select: typeof categorySelect }>) {
  const { _count, ...rest } = row;
  return { ...rest, courseCount: _count.courses };
}

/** Editors read categories to file their courses; only administrators change them. */
@Controller('admin/categories')
@Roles(RoleCode.CONTENT_EDITOR, RoleCode.ADMIN)
export class AdminCategoriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.client.category.findMany({
      select: categorySelect,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: rows.map(toAdminCategory) };
  }

  @Post()
  @Roles(RoleCode.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Body({ schema: createCategoryRequestSchema })
    body: z.infer<typeof createCategoryRequestSchema>,
  ) {
    try {
      const row = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.category.create({
          data: {
            slug: body.slug,
            name: body.name,
            description: body.description ?? null,
            displayOrder: body.displayOrder ?? 0,
          },
          select: categorySelect,
        });
        await this.audit.record(
          {
            action: 'category.created',
            actorUserId: auth.userId,
            resourceType: 'category',
            resourceId: created.id,
            metadata: { slug: body.slug },
            ip: request.ip,
          },
          tx,
        );
        return created;
      });
      return { data: toAdminCategory(row) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(ErrorCode.CONFLICT, HttpStatus.CONFLICT, 'That slug is already used.', [
          { field: 'slug', message: 'That slug is already used.' },
        ]);
      }
      throw error;
    }
  }

  @Patch(':categoryId')
  @Roles(RoleCode.ADMIN)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('categoryId', { schema: z.uuid() }) categoryId: string,
    @Body({ schema: updateCategoryRequestSchema })
    body: z.infer<typeof updateCategoryRequestSchema>,
  ) {
    const row = await this.prisma.client.$transaction(async (tx) => {
      const exists = await tx.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!exists) {
        throw new AppError(
          ErrorCode.RESOURCE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
          'Category not found.',
        );
      }
      const updated = await tx.category.update({
        where: { id: categoryId },
        data: body,
        select: categorySelect,
      });
      await this.audit.record(
        {
          action: 'category.updated',
          actorUserId: auth.userId,
          resourceType: 'category',
          resourceId: categoryId,
          metadata: { fields: Object.keys(body) },
          ip: request.ip,
        },
        tx,
      );
      return updated;
    });
    return { data: toAdminCategory(row) };
  }
}
