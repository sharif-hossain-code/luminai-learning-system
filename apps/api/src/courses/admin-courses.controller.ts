import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  adminCoursesQuerySchema,
  createCourseRequestSchema,
  createLessonRequestSchema,
  createModuleRequestSchema,
  createResourceRequestSchema,
  reorderRequestSchema,
  updateCourseRequestSchema,
  updateLessonRequestSchema,
  updateModuleRequestSchema,
  updateResourceRequestSchema,
} from '@luminai/contracts';
import { Prisma, RoleCode } from '@luminai/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service.js';
import { type AuthContext, CurrentAuth, Roles } from '../identity/auth-context.js';
import { CourseAuthoringService, type Actor } from './course-authoring.service.js';
import { courseSummaryInclude, toAdminCourseSummary } from './course-tree.js';

const uuid = { schema: z.uuid() };
const actor = (auth: AuthContext, request: FastifyRequest): Actor => ({ ...auth, ip: request.ip });

/**
 * Course authoring for content editors and administrators. The guard admits both
 * roles; the service then checks ownership and publishing permission per course.
 */
@Controller('admin')
@Roles(RoleCode.CONTENT_EDITOR, RoleCode.ADMIN)
export class AdminCoursesController {
  constructor(
    private readonly authoring: CourseAuthoringService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- Courses ----------

  @Get('courses')
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query({ schema: adminCoursesQuerySchema }) query: z.infer<typeof adminCoursesQuerySchema>,
  ) {
    const where: Prisma.CourseWhereInput = {
      ...(auth.role === RoleCode.ADMIN ? {} : { ownerId: auth.userId }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.course.findMany({
        where,
        include: courseSummaryInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.course.count({ where }),
    ]);
    return {
      data: rows.map(toAdminCourseSummary),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  @Post('courses')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Body({ schema: createCourseRequestSchema }) body: z.infer<typeof createCourseRequestSchema>,
  ) {
    return { data: await this.authoring.create(actor(auth, request), body) };
  }

  @Get('courses/:courseId')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
  ) {
    return { data: await this.authoring.get(actor(auth, request), courseId) };
  }

  @Patch('courses/:courseId')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
    @Body({ schema: updateCourseRequestSchema }) body: z.infer<typeof updateCourseRequestSchema>,
  ) {
    return { data: await this.authoring.update(actor(auth, request), courseId, body) };
  }

  @Delete('courses/:courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
  ) {
    await this.authoring.remove(actor(auth, request), courseId);
  }

  @Get('courses/:courseId/preview')
  async preview(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
  ) {
    return { data: await this.authoring.preview(actor(auth, request), courseId) };
  }

  @Get('courses/:courseId/versions')
  async versions(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
  ) {
    return { data: await this.authoring.versions(actor(auth, request), courseId) };
  }

  @Post('courses/:courseId/submit-for-review')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
  ) {
    return { data: await this.authoring.submitForReview(actor(auth, request), courseId) };
  }

  @Post('courses/:courseId/return-to-draft')
  @HttpCode(HttpStatus.OK)
  async returnToDraft(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
  ) {
    return { data: await this.authoring.returnToDraft(actor(auth, request), courseId) };
  }

  @Post('courses/:courseId/publish')
  @Roles(RoleCode.ADMIN)
  @HttpCode(HttpStatus.OK)
  async publish(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
  ) {
    return { data: await this.authoring.publish(actor(auth, request), courseId) };
  }

  @Post('courses/:courseId/archive')
  @Roles(RoleCode.ADMIN)
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
  ) {
    return { data: await this.authoring.archive(actor(auth, request), courseId) };
  }

  // ---------- Modules ----------

  @Post('courses/:courseId/modules')
  @HttpCode(HttpStatus.CREATED)
  async createModule(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
    @Body({ schema: createModuleRequestSchema }) body: z.infer<typeof createModuleRequestSchema>,
  ) {
    return { data: await this.authoring.createModule(actor(auth, request), courseId, body) };
  }

  @Put('courses/:courseId/module-order')
  async reorderModules(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('courseId', uuid) courseId: string,
    @Body({ schema: reorderRequestSchema }) body: z.infer<typeof reorderRequestSchema>,
  ) {
    return { data: await this.authoring.reorderModules(actor(auth, request), courseId, body.ids) };
  }

  @Patch('modules/:moduleId')
  async updateModule(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('moduleId', uuid) moduleId: string,
    @Body({ schema: updateModuleRequestSchema }) body: z.infer<typeof updateModuleRequestSchema>,
  ) {
    return { data: await this.authoring.updateModule(actor(auth, request), moduleId, body) };
  }

  @Delete('modules/:moduleId')
  async deleteModule(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('moduleId', uuid) moduleId: string,
  ) {
    return { data: await this.authoring.deleteModule(actor(auth, request), moduleId) };
  }

  // ---------- Lessons ----------

  @Post('modules/:moduleId/lessons')
  @HttpCode(HttpStatus.CREATED)
  async createLesson(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('moduleId', uuid) moduleId: string,
    @Body({ schema: createLessonRequestSchema }) body: z.infer<typeof createLessonRequestSchema>,
  ) {
    return { data: await this.authoring.createLesson(actor(auth, request), moduleId, body) };
  }

  @Put('modules/:moduleId/lesson-order')
  async reorderLessons(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('moduleId', uuid) moduleId: string,
    @Body({ schema: reorderRequestSchema }) body: z.infer<typeof reorderRequestSchema>,
  ) {
    return { data: await this.authoring.reorderLessons(actor(auth, request), moduleId, body.ids) };
  }

  @Patch('lessons/:lessonId')
  async updateLesson(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('lessonId', uuid) lessonId: string,
    @Body({ schema: updateLessonRequestSchema }) body: z.infer<typeof updateLessonRequestSchema>,
  ) {
    return { data: await this.authoring.updateLesson(actor(auth, request), lessonId, body) };
  }

  @Delete('lessons/:lessonId')
  async deleteLesson(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('lessonId', uuid) lessonId: string,
  ) {
    return { data: await this.authoring.deleteLesson(actor(auth, request), lessonId) };
  }

  // ---------- Resources ----------

  @Post('lessons/:lessonId/resources')
  @HttpCode(HttpStatus.CREATED)
  async createResource(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('lessonId', uuid) lessonId: string,
    @Body({ schema: createResourceRequestSchema })
    body: z.infer<typeof createResourceRequestSchema>,
  ) {
    return { data: await this.authoring.createResource(actor(auth, request), lessonId, body) };
  }

  @Patch('resources/:resourceId')
  async updateResource(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('resourceId', uuid) resourceId: string,
    @Body({ schema: updateResourceRequestSchema })
    body: z.infer<typeof updateResourceRequestSchema>,
  ) {
    return { data: await this.authoring.updateResource(actor(auth, request), resourceId, body) };
  }

  @Delete('resources/:resourceId')
  async deleteResource(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Param('resourceId', uuid) resourceId: string,
  ) {
    return { data: await this.authoring.deleteResource(actor(auth, request), resourceId) };
  }
}
