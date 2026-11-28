import { HttpStatus, Injectable } from '@nestjs/common';
import {
  courseSnapshotSchema,
  DURATION_FILTERS,
  ErrorCode,
  type CatalogCourse,
  type CatalogCourseDetail,
  type CatalogQuery,
} from '@luminai/contracts';
import { CourseStatus, Prisma, type CourseLevel } from '@luminai/database';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';

interface CatalogRow {
  id: string;
  slug: string;
  featured_rank: number | null;
  title: string;
  summary: string;
  level: CourseLevel;
  estimated_minutes: number;
  module_count: number;
  lesson_count: number;
  version: number;
  published_at: Date;
  category_id: string;
  category_slug: string;
  category_name: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escapes LIKE wildcards so a search for "100%" means the literal text. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function toCatalogCourse(row: CatalogRow): CatalogCourse {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: { id: row.category_id, slug: row.category_slug, name: row.category_name },
    level: row.level,
    estimatedMinutes: row.estimated_minutes,
    moduleCount: row.module_count,
    lessonCount: row.lesson_count,
    featured: row.featured_rank !== null,
    version: row.version,
    publishedAt: row.published_at.toISOString(),
  };
}

/**
 * The learner-facing catalogue. It reads published versions only (via
 * courses.published_version_id), never the editable working copy, and hides
 * archived courses. Drafts can't leak because they have no published version.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  categories() {
    return this.prisma.client.category.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, description: true },
    });
  }

  async list(query: CatalogQuery): Promise<{ data: CatalogCourse[]; total: number }> {
    const q = query.q?.trim() ?? '';
    const conditions: Prisma.Sql[] = [
      Prisma.sql`c.status <> ${CourseStatus.ARCHIVED}::course_status`,
    ];
    if (query.category) conditions.push(Prisma.sql`cat.slug = ${query.category}`);
    if (query.level) conditions.push(Prisma.sql`v.level = ${query.level}::course_level`);
    if (query.duration) {
      const { min, max } = DURATION_FILTERS[query.duration];
      conditions.push(Prisma.sql`v.estimated_minutes >= ${min}`);
      if (max !== null) conditions.push(Prisma.sql`v.estimated_minutes <= ${max}`);
    }
    const like = likePattern(q);
    if (q) {
      // Whole words through the full-text index, plus substring matches so partial
      // words ("negoti") still find something while the learner is typing.
      conditions.push(Prisma.sql`(
        v.search_vector @@ websearch_to_tsquery('english', ${q})
        OR v.title ILIKE ${like}
        OR v.search_text ILIKE ${like}
      )`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const rank = q
      ? Prisma.sql`ts_rank(v.search_vector, websearch_to_tsquery('english', ${q}))
          + CASE WHEN v.title ILIKE ${like} THEN 1 ELSE 0 END`
      : Prisma.sql`0`;

    const sort = query.sort ?? (q ? 'relevance' : 'curated');
    const orderBy =
      sort === 'newest'
        ? Prisma.sql`c.first_published_at DESC, c.id ASC`
        : sort === 'relevance' && q
          ? Prisma.sql`rank DESC, c.featured_rank ASC NULLS LAST, c.first_published_at DESC, c.id ASC`
          : Prisma.sql`c.featured_rank ASC NULLS LAST, c.first_published_at DESC, c.id ASC`;

    const from = Prisma.sql`
      FROM courses c
      JOIN course_versions v ON v.id = c.published_version_id
      JOIN categories cat ON cat.id = v.category_id
      WHERE ${where}`;

    const [rows, counts] = await Promise.all([
      this.prisma.client.$queryRaw<(CatalogRow & { rank: number })[]>`
        SELECT c.id, c.slug, c.featured_rank, v.title, v.summary, v.level,
               v.estimated_minutes, v.module_count, v.lesson_count, v.version, v.published_at,
               cat.id AS category_id, cat.slug AS category_slug, cat.name AS category_name,
               ${rank} AS rank
        ${from}
        ORDER BY ${orderBy}
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      this.prisma.client.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total ${from}`,
    ]);
    return { data: rows.map(toCatalogCourse), total: Number(counts[0]?.total ?? 0) };
  }

  async detail(idOrSlug: string): Promise<CatalogCourseDetail> {
    const course = await this.prisma.client.course.findFirst({
      where: {
        ...(UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug.toLowerCase() }),
        status: { not: CourseStatus.ARCHIVED },
        publishedVersionId: { not: null },
      },
      select: {
        id: true,
        slug: true,
        featuredRank: true,
        publishedVersion: {
          select: {
            version: true,
            publishedAt: true,
            moduleCount: true,
            lessonCount: true,
            snapshot: true,
            category: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });
    const version = course?.publishedVersion;
    if (!course || !version) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, 'Course not found.');
    }
    const snapshot = courseSnapshotSchema.parse(version.snapshot);
    return {
      id: course.id,
      slug: course.slug,
      title: snapshot.course.title,
      summary: snapshot.course.summary,
      description: snapshot.course.description,
      category: version.category,
      level: snapshot.course.level,
      estimatedMinutes: snapshot.course.estimatedMinutes,
      moduleCount: version.moduleCount,
      lessonCount: version.lessonCount,
      featured: course.featuredRank !== null,
      version: version.version,
      publishedAt: version.publishedAt.toISOString(),
      outcomes: snapshot.course.outcomes,
      prerequisites: snapshot.course.prerequisites,
      // The outline only: titles, types and durations. Lesson content needs enrolment.
      modules: snapshot.modules.map((module) => ({
        id: module.id,
        title: module.title,
        description: module.description,
        lessons: module.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          estimatedMinutes: lesson.estimatedMinutes,
        })),
      })),
    };
  }
}
