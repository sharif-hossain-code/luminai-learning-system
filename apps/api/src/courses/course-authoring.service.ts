import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  slugify,
  type AdminCourse,
  type CreateCourseRequest,
  type PublishIssue,
  type UpdateCourseRequest,
  type UpdateLessonRequest,
} from '@luminai/contracts';
import { CourseStatus, Prisma, RoleCode, UserStatus } from '@luminai/database';
import { randomBytes } from 'node:crypto';
import { AuditService, type AuditAction } from '../audit/audit.service.js';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import {
  BY_POSITION,
  buildSnapshot,
  courseTreeInclude,
  findPublishIssues,
  searchTextFor,
  toAdminCourse,
  type CourseTree,
} from './course-tree.js';

type Tx = Prisma.TransactionClient;

export interface Actor extends AuthContext {
  ip?: string;
}

const notFound = (what = 'Course') =>
  new AppError(ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, `${what} not found.`);

const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, message);

const conflict = (message: string) =>
  new AppError(ErrorCode.CONFLICT, HttpStatus.CONFLICT, message);

function publishBlocked(issues: PublishIssue[]) {
  return new AppError(
    ErrorCode.PUBLISH_VALIDATION_FAILED,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'This course is not ready to publish yet.',
    issues.map((issue) => ({ field: issue.path, message: issue.message })),
  );
}

const isAdmin = (actor: Actor) => actor.role === RoleCode.ADMIN;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Course authoring: the editable working copy, the review/publish workflow and
 * immutable published versions. Authorization is enforced here, not only by the
 * route guards: content editors can only touch courses they own, and only
 * administrators publish, archive, feature or reassign courses.
 */
@Injectable()
export class CourseAuthoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // ---------- Access ----------

  /** Loads the course id the actor may edit, or throws 404 (unknown) / 403 (not theirs). */
  private async assertCanEdit(
    tx: Tx | PrismaService['client'],
    actor: Actor,
    courseId: string,
  ): Promise<void> {
    const course = await tx.course.findUnique({
      where: { id: courseId },
      select: { ownerId: true },
    });
    if (!course) throw notFound();
    if (!isAdmin(actor) && course.ownerId !== actor.userId) {
      throw forbidden('Only the course owner or an administrator can edit this course.');
    }
  }

  private async courseIdForModule(tx: Tx, moduleId: string): Promise<string> {
    const row = await tx.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
    if (!row) throw notFound('Module');
    return row.courseId;
  }

  private async lessonRef(tx: Tx, lessonId: string) {
    const row = await tx.lesson.findUnique({
      where: { id: lessonId },
      select: { moduleId: true, module: { select: { courseId: true } } },
    });
    if (!row) throw notFound('Lesson');
    return { moduleId: row.moduleId, courseId: row.module.courseId };
  }

  private async resourceRef(tx: Tx, resourceId: string) {
    const row = await tx.lessonResource.findUnique({
      where: { id: resourceId },
      select: { lessonId: true, lesson: { select: { module: { select: { courseId: true } } } } },
    });
    if (!row) throw notFound('Resource');
    return { lessonId: row.lessonId, courseId: row.lesson.module.courseId };
  }

  /** Every edit of the working copy bumps the draft revision, so "unpublished changes" is exact. */
  private touch(tx: Tx, actor: Actor, courseId: string) {
    return tx.course.update({
      where: { id: courseId },
      data: { draftRevision: { increment: 1 }, updatedById: actor.userId },
      select: { id: true },
    });
  }

  private permissions(actor: Actor) {
    return { canPublish: isAdmin(actor), canArchive: isAdmin(actor) };
  }

  private async loadTree(tx: Tx | PrismaService['client'], courseId: string): Promise<CourseTree> {
    const tree = await tx.course.findUnique({
      where: { id: courseId },
      include: courseTreeInclude,
    });
    if (!tree) throw notFound();
    return tree;
  }

  private async view(actor: Actor, courseId: string): Promise<AdminCourse> {
    return toAdminCourse(await this.loadTree(this.db, courseId), this.permissions(actor));
  }

  /** Runs an edit of one course's working copy in a transaction, then returns the new tree. */
  private async edit(
    actor: Actor,
    resolveCourseId: (tx: Tx) => Promise<string>,
    work: (tx: Tx, courseId: string) => Promise<void>,
  ): Promise<AdminCourse> {
    const courseId = await this.db.$transaction(async (tx) => {
      const id = await resolveCourseId(tx);
      await this.assertCanEdit(tx, actor, id);
      await work(tx, id);
      await this.touch(tx, actor, id);
      return id;
    });
    return this.view(actor, courseId);
  }

  private record(
    tx: Tx,
    actor: Actor,
    action: AuditAction,
    courseId: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    return this.audit.record(
      {
        action,
        actorUserId: actor.userId,
        resourceType: 'course',
        resourceId: courseId,
        metadata,
        ...(actor.ip ? { ip: actor.ip } : {}),
      },
      tx,
    );
  }

  // ---------- Courses ----------

  async get(actor: Actor, courseId: string): Promise<AdminCourse> {
    await this.assertCanEdit(this.db, actor, courseId);
    return this.view(actor, courseId);
  }

  async preview(actor: Actor, courseId: string) {
    await this.assertCanEdit(this.db, actor, courseId);
    return buildSnapshot(await this.loadTree(this.db, courseId));
  }

  async create(actor: Actor, input: CreateCourseRequest): Promise<AdminCourse> {
    const category = await this.db.category.findUnique({
      where: { id: input.categoryId },
      select: { isActive: true },
    });
    if (!category?.isActive) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Choose an active category.',
        [{ field: 'categoryId', message: 'Choose an active category.' }],
      );
    }
    const base = input.slug ?? (slugify(input.title) || 'course');
    // An explicit slug must be free; a generated one gets a short suffix when taken.
    const candidates = input.slug
      ? [base]
      : [
          base,
          ...Array.from(
            { length: 3 },
            () => `${base.slice(0, 73)}-${randomBytes(3).toString('hex')}`,
          ),
        ];

    for (const slug of candidates) {
      try {
        const id = await this.db.$transaction(async (tx) => {
          const course = await tx.course.create({
            data: {
              title: input.title,
              slug,
              categoryId: input.categoryId,
              ownerId: actor.userId,
              updatedById: actor.userId,
            },
            select: { id: true },
          });
          await this.record(tx, actor, 'course.created', course.id, { slug });
          return course.id;
        });
        return this.view(actor, id);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new AppError(
      ErrorCode.CONFLICT,
      HttpStatus.CONFLICT,
      'That web address is already used by another course.',
      [{ field: 'slug', message: 'That web address is already used by another course.' }],
    );
  }

  async update(actor: Actor, courseId: string, input: UpdateCourseRequest): Promise<AdminCourse> {
    if (!isAdmin(actor) && (input.ownerId !== undefined || input.featuredRank !== undefined)) {
      throw forbidden('Only administrators can change the owner or the featured order.');
    }
    try {
      return await this.edit(
        actor,
        () => Promise.resolve(courseId),
        async (tx, id) => {
          const current = await tx.course.findUniqueOrThrow({
            where: { id },
            select: { slug: true, firstPublishedAt: true, ownerId: true },
          });
          if (input.slug !== undefined && input.slug !== current.slug && current.firstPublishedAt) {
            throw new AppError(
              ErrorCode.CONFLICT,
              HttpStatus.CONFLICT,
              "A published course's web address can't change, so links to it keep working.",
              [{ field: 'slug', message: "A published course's web address can't change." }],
            );
          }
          if (input.categoryId !== undefined) {
            const category = await tx.category.findUnique({
              where: { id: input.categoryId },
              select: { isActive: true },
            });
            if (!category?.isActive) {
              throw new AppError(
                ErrorCode.VALIDATION_FAILED,
                HttpStatus.UNPROCESSABLE_ENTITY,
                'Choose an active category.',
                [{ field: 'categoryId', message: 'Choose an active category.' }],
              );
            }
          }
          if (input.ownerId !== undefined && input.ownerId !== current.ownerId) {
            const owner = await tx.user.findUnique({
              where: { id: input.ownerId },
              select: { status: true, role: { select: { code: true } } },
            });
            if (
              !owner ||
              owner.status !== UserStatus.ACTIVE ||
              owner.role.code === RoleCode.LEARNER
            ) {
              throw new AppError(
                ErrorCode.VALIDATION_FAILED,
                HttpStatus.UNPROCESSABLE_ENTITY,
                'Choose an active content editor or administrator.',
                [
                  {
                    field: 'ownerId',
                    message: 'Choose an active content editor or administrator.',
                  },
                ],
              );
            }
            await this.record(tx, actor, 'course.owner_changed', id, {
              from: current.ownerId,
              to: input.ownerId,
            });
          }
          await tx.course.update({ where: { id }, data: input });
        },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          ErrorCode.CONFLICT,
          HttpStatus.CONFLICT,
          'That web address is already used by another course.',
          [{ field: 'slug', message: 'That web address is already used by another course.' }],
        );
      }
      throw error;
    }
  }

  async remove(actor: Actor, courseId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await this.assertCanEdit(tx, actor, courseId);
      const course = await tx.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { firstPublishedAt: true, slug: true },
      });
      if (course.firstPublishedAt) {
        throw conflict('A course that has been published is archived, not deleted.');
      }
      await tx.course.delete({ where: { id: courseId } });
      await this.record(tx, actor, 'course.deleted', courseId, { slug: course.slug });
    });
  }

  // ---------- Workflow ----------

  async submitForReview(actor: Actor, courseId: string): Promise<AdminCourse> {
    await this.db.$transaction(async (tx) => {
      await this.assertCanEdit(tx, actor, courseId);
      const tree = await this.loadTree(tx, courseId);
      if (tree.status === CourseStatus.REVIEW)
        throw conflict('This course is already waiting for review.');
      if (tree.status === CourseStatus.PUBLISHED && tree.draftRevision === tree.publishedRevision) {
        throw conflict('There are no changes to review since the last publish.');
      }
      const issues = findPublishIssues(tree);
      if (issues.length) throw publishBlocked(issues);
      await tx.course.update({
        where: { id: courseId },
        data: { status: CourseStatus.REVIEW, reviewRequestedAt: new Date() },
      });
      await this.record(tx, actor, 'course.submitted_for_review', courseId, {
        draftRevision: tree.draftRevision,
      });
    });
    return this.view(actor, courseId);
  }

  async returnToDraft(actor: Actor, courseId: string): Promise<AdminCourse> {
    await this.db.$transaction(async (tx) => {
      await this.assertCanEdit(tx, actor, courseId);
      const course = await tx.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { status: true, publishedVersionId: true },
      });
      if (course.status !== CourseStatus.REVIEW)
        throw conflict('This course is not waiting for review.');
      await tx.course.update({
        where: { id: courseId },
        data: {
          // A live course stays live; only the review request is withdrawn.
          status: course.publishedVersionId ? CourseStatus.PUBLISHED : CourseStatus.DRAFT,
          reviewRequestedAt: null,
        },
      });
      await this.record(tx, actor, 'course.returned_to_draft', courseId);
    });
    return this.view(actor, courseId);
  }

  /** Freezes the working copy into version N+1 and makes it live. Administrators only. */
  async publish(actor: Actor, courseId: string): Promise<AdminCourse> {
    if (!isAdmin(actor)) throw forbidden('Only administrators can publish courses.');
    await this.db.$transaction(async (tx) => {
      // Serialise publishes of the same course so version numbers never collide.
      await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
      const tree = await this.loadTree(tx, courseId);
      if (tree.status === CourseStatus.PUBLISHED && tree.draftRevision === tree.publishedRevision) {
        throw conflict('The live version is already up to date.');
      }
      const issues = findPublishIssues(tree);
      if (issues.length) throw publishBlocked(issues);

      const latest = await tx.courseVersion.aggregate({
        where: { courseId },
        _max: { version: true },
      });
      const versionNumber = (latest._max.version ?? 0) + 1;
      const lessonCount = tree.modules.reduce((sum, module) => sum + module.lessons.length, 0);
      const now = new Date();
      const version = await tx.courseVersion.create({
        data: {
          courseId,
          version: versionNumber,
          categoryId: tree.categoryId,
          title: tree.title,
          summary: tree.summary,
          level: tree.level,
          estimatedMinutes: tree.estimatedMinutes,
          moduleCount: tree.modules.length,
          lessonCount,
          searchText: searchTextFor(tree),
          snapshot: buildSnapshot(tree),
          draftRevision: tree.draftRevision,
          publishedById: actor.userId,
          publishedAt: now,
        },
        select: { id: true },
      });
      await tx.course.update({
        where: { id: courseId },
        data: {
          status: CourseStatus.PUBLISHED,
          publishedVersionId: version.id,
          publishedRevision: tree.draftRevision,
          publishedAt: now,
          firstPublishedAt: tree.firstPublishedAt ?? now,
          reviewRequestedAt: null,
          archivedAt: null,
        },
      });
      await this.record(tx, actor, 'course.published', courseId, {
        version: versionNumber,
        draftRevision: tree.draftRevision,
      });
    });
    return this.view(actor, courseId);
  }

  async archive(actor: Actor, courseId: string): Promise<AdminCourse> {
    if (!isAdmin(actor)) throw forbidden('Only administrators can archive courses.');
    await this.db.$transaction(async (tx) => {
      const course = await tx.course.findUnique({
        where: { id: courseId },
        select: { status: true, publishedVersionId: true },
      });
      if (!course) throw notFound();
      if (course.status === CourseStatus.ARCHIVED)
        throw conflict('This course is already archived.');
      if (!course.publishedVersionId) throw conflict('Only a published course can be archived.');
      await tx.course.update({
        where: { id: courseId },
        data: { status: CourseStatus.ARCHIVED, archivedAt: new Date(), reviewRequestedAt: null },
      });
      await this.record(tx, actor, 'course.archived', courseId);
    });
    return this.view(actor, courseId);
  }

  async versions(actor: Actor, courseId: string) {
    await this.assertCanEdit(this.db, actor, courseId);
    const [course, rows] = await Promise.all([
      this.db.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { publishedVersionId: true, status: true },
      }),
      this.db.courseVersion.findMany({
        where: { courseId },
        orderBy: { version: 'desc' },
        select: {
          id: true,
          version: true,
          title: true,
          publishedAt: true,
          publishedBy: {
            select: { id: true, email: true, profile: { select: { displayName: true } } },
          },
        },
      }),
    ]);
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      title: row.title,
      publishedAt: row.publishedAt.toISOString(),
      publishedBy: row.publishedBy
        ? {
            id: row.publishedBy.id,
            email: row.publishedBy.email,
            displayName: row.publishedBy.profile?.displayName ?? null,
          }
        : null,
      live: row.id === course.publishedVersionId && course.status !== CourseStatus.ARCHIVED,
    }));
  }

  // ---------- Modules ----------

  createModule(
    actor: Actor,
    courseId: string,
    input: { title: string; description?: string | undefined },
  ) {
    return this.edit(
      actor,
      () => Promise.resolve(courseId),
      async (tx, id) => {
        const last = await tx.module.aggregate({
          where: { courseId: id },
          _max: { position: true },
        });
        await tx.module.create({
          data: {
            courseId: id,
            title: input.title,
            description: input.description ?? '',
            position: (last._max.position ?? -1) + 1,
          },
        });
      },
    );
  }

  updateModule(
    actor: Actor,
    moduleId: string,
    input: {
      title?: string | undefined;
      description?: string | undefined;
      isRequired?: boolean | undefined;
    },
  ) {
    return this.edit(
      actor,
      (tx) => this.courseIdForModule(tx, moduleId),
      async (tx) => {
        await tx.module.update({ where: { id: moduleId }, data: input });
      },
    );
  }

  deleteModule(actor: Actor, moduleId: string) {
    return this.edit(
      actor,
      (tx) => this.courseIdForModule(tx, moduleId),
      async (tx, courseId) => {
        await tx.module.delete({ where: { id: moduleId } });
        const rest = await tx.module.findMany({
          where: { courseId },
          orderBy: [...BY_POSITION],
          select: { id: true },
        });
        await this.renumber(
          tx,
          'module',
          rest.map((row) => row.id),
        );
      },
    );
  }

  reorderModules(actor: Actor, courseId: string, ids: string[]) {
    return this.edit(
      actor,
      () => Promise.resolve(courseId),
      async (tx, id) => {
        const rows = await tx.module.findMany({ where: { courseId: id }, select: { id: true } });
        this.assertSameSet(
          rows.map((row) => row.id),
          ids,
          'module',
        );
        await this.renumber(tx, 'module', ids);
      },
    );
  }

  // ---------- Lessons ----------

  createLesson(
    actor: Actor,
    moduleId: string,
    input: { title: string; type?: UpdateLessonRequest['type'] },
  ) {
    return this.edit(
      actor,
      (tx) => this.courseIdForModule(tx, moduleId),
      async (tx) => {
        const last = await tx.lesson.aggregate({ where: { moduleId }, _max: { position: true } });
        await tx.lesson.create({
          data: {
            moduleId,
            title: input.title,
            ...(input.type ? { type: input.type } : {}),
            ...(input.type === 'VIDEO' || input.type === 'AUDIO'
              ? { completionRule: 'MEDIA_FINISHED' }
              : {}),
            position: (last._max.position ?? -1) + 1,
          },
        });
      },
    );
  }

  updateLesson(actor: Actor, lessonId: string, input: UpdateLessonRequest) {
    return this.edit(
      actor,
      async (tx) => (await this.lessonRef(tx, lessonId)).courseId,
      async (tx, courseId) => {
        const { moduleId, content, ...fields } = input;
        const data: Prisma.LessonUncheckedUpdateInput = { ...fields };
        if (content !== undefined) data.content = content;
        const ref = await this.lessonRef(tx, lessonId);
        if (moduleId !== undefined && moduleId !== ref.moduleId) {
          const target = await tx.module.findUnique({
            where: { id: moduleId },
            select: { courseId: true },
          });
          if (!target || target.courseId !== courseId) {
            throw new AppError(
              ErrorCode.VALIDATION_FAILED,
              HttpStatus.UNPROCESSABLE_ENTITY,
              'Choose a module of the same course.',
              [{ field: 'moduleId', message: 'Choose a module of the same course.' }],
            );
          }
          const last = await tx.lesson.aggregate({ where: { moduleId }, _max: { position: true } });
          data.moduleId = moduleId;
          data.position = (last._max.position ?? -1) + 1;
        }
        await tx.lesson.update({ where: { id: lessonId }, data });
        if (data.moduleId) {
          const rest = await tx.lesson.findMany({
            where: { moduleId: ref.moduleId },
            orderBy: [...BY_POSITION],
            select: { id: true },
          });
          await this.renumber(
            tx,
            'lesson',
            rest.map((row) => row.id),
          );
        }
      },
    );
  }

  deleteLesson(actor: Actor, lessonId: string) {
    return this.edit(
      actor,
      async (tx) => (await this.lessonRef(tx, lessonId)).courseId,
      async (tx) => {
        const { moduleId } = await this.lessonRef(tx, lessonId);
        await tx.lesson.delete({ where: { id: lessonId } });
        const rest = await tx.lesson.findMany({
          where: { moduleId },
          orderBy: [...BY_POSITION],
          select: { id: true },
        });
        await this.renumber(
          tx,
          'lesson',
          rest.map((row) => row.id),
        );
      },
    );
  }

  reorderLessons(actor: Actor, moduleId: string, ids: string[]) {
    return this.edit(
      actor,
      (tx) => this.courseIdForModule(tx, moduleId),
      async (tx) => {
        const rows = await tx.lesson.findMany({ where: { moduleId }, select: { id: true } });
        this.assertSameSet(
          rows.map((row) => row.id),
          ids,
          'lesson',
        );
        await this.renumber(tx, 'lesson', ids);
      },
    );
  }

  // ---------- Resources ----------

  createResource(
    actor: Actor,
    lessonId: string,
    input: {
      type: Prisma.LessonResourceCreateInput['type'];
      title: string;
      externalUrl: string;
      mimeType?: string | undefined;
    },
  ) {
    return this.edit(
      actor,
      async (tx) => (await this.lessonRef(tx, lessonId)).courseId,
      async (tx) => {
        const last = await tx.lessonResource.aggregate({
          where: { lessonId },
          _max: { position: true },
        });
        await tx.lessonResource.create({
          data: {
            lessonId,
            type: input.type,
            title: input.title,
            externalUrl: input.externalUrl,
            mimeType: input.mimeType ?? null,
            position: (last._max.position ?? -1) + 1,
          },
        });
      },
    );
  }

  updateResource(actor: Actor, resourceId: string, input: Prisma.LessonResourceUpdateInput) {
    return this.edit(
      actor,
      async (tx) => (await this.resourceRef(tx, resourceId)).courseId,
      async (tx) => {
        await tx.lessonResource.update({ where: { id: resourceId }, data: input });
      },
    );
  }

  deleteResource(actor: Actor, resourceId: string) {
    return this.edit(
      actor,
      async (tx) => (await this.resourceRef(tx, resourceId)).courseId,
      async (tx) => {
        const { lessonId } = await this.resourceRef(tx, resourceId);
        await tx.lessonResource.delete({ where: { id: resourceId } });
        const rest = await tx.lessonResource.findMany({
          where: { lessonId },
          orderBy: [...BY_POSITION],
          select: { id: true },
        });
        await this.renumber(
          tx,
          'resource',
          rest.map((row) => row.id),
        );
      },
    );
  }

  // ---------- Ordering helpers ----------

  private assertSameSet(existing: string[], requested: string[], label: string) {
    const known = new Set(existing);
    if (requested.length !== known.size || requested.some((id) => !known.has(id))) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        HttpStatus.UNPROCESSABLE_ENTITY,
        `List every ${label} exactly once.`,
        [{ field: 'ids', message: `List every ${label} exactly once.` }],
      );
    }
  }

  /** Writes positions 0..n-1 in the given order. */
  private async renumber(tx: Tx, kind: 'module' | 'lesson' | 'resource', ids: string[]) {
    for (const [position, id] of ids.entries()) {
      if (kind === 'module') await tx.module.update({ where: { id }, data: { position } });
      else if (kind === 'lesson') await tx.lesson.update({ where: { id }, data: { position } });
      else await tx.lessonResource.update({ where: { id }, data: { position } });
    }
  }
}
