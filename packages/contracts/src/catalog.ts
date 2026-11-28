import { z } from 'zod';
import { adminAssessmentSchema, snapshotAssessmentSchema } from './assessment.js';
import { lessonContentSchema, multilineText, plainText, safeUrlSchema } from './content.js';

// ---------- Enumerations (values match the database enums) ----------

export const COURSE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const courseLevelSchema = z.enum(COURSE_LEVELS);
export type CourseLevel = z.infer<typeof courseLevelSchema>;

export const COURSE_STATUSES = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export const courseStatusSchema = z.enum(COURSE_STATUSES);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const LESSON_TYPES = ['TEXT', 'VIDEO', 'AUDIO', 'INTERACTIVE', 'EXTERNAL_LINK'] as const;
export const lessonTypeSchema = z.enum(LESSON_TYPES);
export type LessonType = z.infer<typeof lessonTypeSchema>;

export const COMPLETION_RULES = ['MARK_COMPLETE', 'VIEW', 'MEDIA_FINISHED'] as const;
export const completionRuleSchema = z.enum(COMPLETION_RULES);
export type CompletionRule = z.infer<typeof completionRuleSchema>;

export const RESOURCE_TYPES = [
  'VIDEO',
  'AUDIO',
  'CAPTIONS',
  'TRANSCRIPT',
  'DOCUMENT',
  'LINK',
] as const;
export const resourceTypeSchema = z.enum(RESOURCE_TYPES);
export type ResourceType = z.infer<typeof resourceTypeSchema>;

/** Catalogue length filter: under 3 hours, 3 to 8 hours, over 8 hours. */
export const DURATION_FILTERS = {
  short: { label: 'Under 3 hours', min: 0, max: 179 },
  medium: { label: '3–8 hours', min: 180, max: 480 },
  long: { label: 'Over 8 hours', min: 481, max: null },
} as const;
export type DurationFilter = keyof typeof DURATION_FILTERS;

export const CATALOG_SORTS = ['curated', 'newest', 'relevance'] as const;

// ---------- Shared field schemas ----------

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80, 'Use at most 80 characters.')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and single hyphens.');

/** Makes a URL slug from a title: "Public speaking: the basics" → "public-speaking-the-basics". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const minutesSchema = z.number().int().min(0).max(100_000);
const listOfLines = (max: number, itemMax: number, label: string) =>
  z.array(plainText(itemMax, label)).max(max, `Add at most ${max}.`);

// ---------- Public catalogue ----------

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: slugSchema.optional(),
  level: courseLevelSchema.optional(),
  duration: z.enum(['short', 'medium', 'long']).optional(),
  sort: z.enum(CATALOG_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const categorySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});
export type Category = z.infer<typeof categorySchema>;

export const catalogCourseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  category: categorySchema.pick({ id: true, slug: true, name: true }),
  level: courseLevelSchema,
  estimatedMinutes: z.number().int(),
  moduleCount: z.number().int(),
  lessonCount: z.number().int(),
  featured: z.boolean(),
  version: z.number().int(),
  publishedAt: z.iso.datetime(),
});
export type CatalogCourse = z.infer<typeof catalogCourseSchema>;

export const catalogLessonOutlineSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  type: lessonTypeSchema,
  estimatedMinutes: z.number().int(),
});

export const catalogModuleOutlineSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  lessons: z.array(catalogLessonOutlineSchema),
});

/** Course detail: everything a learner sees before enrolling. Never lesson content. */
export const catalogCourseDetailSchema = catalogCourseSchema.extend({
  description: z.string(),
  outcomes: z.array(z.string()),
  prerequisites: z.array(z.string()),
  modules: z.array(catalogModuleOutlineSchema),
});
export type CatalogCourseDetail = z.infer<typeof catalogCourseDetailSchema>;

// ---------- Published snapshot (stored in course_versions.snapshot) ----------

/**
 * Version 2 added `assessments`. Version 1 snapshots (published before Phase 5)
 * are still read: they simply have no assessments.
 */
export const COURSE_SNAPSHOT_SCHEMA_VERSION = 2;

export const snapshotResourceSchema = z.object({
  id: z.uuid(),
  type: resourceTypeSchema,
  title: z.string(),
  storageKey: z.string().nullable(),
  externalUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
});

export const snapshotLessonSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  type: lessonTypeSchema,
  objectives: z.array(z.string()),
  content: lessonContentSchema,
  estimatedMinutes: z.number().int(),
  completionRule: completionRuleSchema,
  isRequired: z.boolean(),
  resources: z.array(snapshotResourceSchema),
});

export const snapshotModuleSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  isRequired: z.boolean(),
  lessons: z.array(snapshotLessonSchema),
});

export const courseSnapshotSchema = z.object({
  snapshotSchemaVersion: z.union([z.literal(1), z.literal(COURSE_SNAPSHOT_SCHEMA_VERSION)]),
  course: z.object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    description: z.string(),
    categoryId: z.uuid(),
    level: courseLevelSchema,
    estimatedMinutes: z.number().int(),
    outcomes: z.array(z.string()),
    prerequisites: z.array(z.string()),
    keywords: z.array(z.string()),
    coverObjectKey: z.string().nullable(),
  }),
  modules: z.array(snapshotModuleSchema),
  /**
   * Module quizzes (in module order, then position) and course-level assessments
   * (moduleId null). Includes the answer keys: never send a snapshot to learners.
   */
  assessments: z.array(snapshotAssessmentSchema).default([]),
});
export type CourseSnapshot = z.infer<typeof courseSnapshotSchema>;

// ---------- Authoring requests ----------

export const createCategoryRequestSchema = z
  .object({
    slug: slugSchema,
    name: plainText(80, 'The name'),
    description: plainText(300, 'The description').nullable().optional(),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const updateCategoryRequestSchema = z
  .object({
    name: plainText(80, 'The name'),
    description: plainText(300, 'The description').nullable(),
    displayOrder: z.number().int().min(0).max(10_000),
    isActive: z.boolean(),
  })
  .partial()
  .strict();

export const createCourseRequestSchema = z
  .object({
    title: plainText(120, 'The title'),
    categoryId: z.uuid(),
    /** Optional: made from the title when left out. */
    slug: slugSchema.optional(),
  })
  .strict();
export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;

export const updateCourseRequestSchema = z
  .object({
    title: plainText(120, 'The title'),
    slug: slugSchema,
    categoryId: z.uuid(),
    summary: multilineText(300, 'The summary'),
    description: multilineText(5000, 'The description'),
    level: courseLevelSchema,
    estimatedMinutes: minutesSchema,
    outcomes: listOfLines(12, 200, 'An outcome'),
    prerequisites: listOfLines(12, 200, 'A prerequisite'),
    keywords: listOfLines(20, 40, 'A keyword'),
    /** Administrators only. */
    featuredRank: z.number().int().min(1).max(1000).nullable(),
    /** Administrators only: hands the course to another editor. */
    ownerId: z.uuid(),
  })
  .partial()
  .strict();
export type UpdateCourseRequest = z.infer<typeof updateCourseRequestSchema>;

export const createModuleRequestSchema = z
  .object({
    title: plainText(120, 'The title'),
    description: multilineText(1000, 'The description').optional(),
  })
  .strict();

export const updateModuleRequestSchema = z
  .object({
    title: plainText(120, 'The title'),
    description: multilineText(1000, 'The description'),
    isRequired: z.boolean(),
  })
  .partial()
  .strict();

export const createLessonRequestSchema = z
  .object({ title: plainText(120, 'The title'), type: lessonTypeSchema.optional() })
  .strict();

export const updateLessonRequestSchema = z
  .object({
    title: plainText(120, 'The title'),
    type: lessonTypeSchema,
    objectives: listOfLines(10, 200, 'An objective'),
    content: lessonContentSchema,
    estimatedMinutes: z.number().int().min(0).max(10_000),
    completionRule: completionRuleSchema,
    isRequired: z.boolean(),
    /** Moves the lesson to another module of the same course (appended at the end). */
    moduleId: z.uuid(),
  })
  .partial()
  .strict();
export type UpdateLessonRequest = z.infer<typeof updateLessonRequestSchema>;

export const createResourceRequestSchema = z
  .object({
    type: resourceTypeSchema,
    title: plainText(120, 'The title'),
    /** Uploads (storage keys) arrive with media storage; for now resources are https links. */
    externalUrl: safeUrlSchema,
    mimeType: z
      .string()
      .trim()
      .regex(/^[a-z]+\/[a-z0-9.+-]+$/i, 'Enter a valid file type, like video/mp4.')
      .max(100)
      .optional(),
  })
  .strict();

export const updateResourceRequestSchema = createResourceRequestSchema.partial().strict();

export const reorderRequestSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(500) })
  .strict()
  .refine((value) => new Set(value.ids).size === value.ids.length, {
    message: 'Each item can appear only once.',
    path: ['ids'],
  });

export const adminCoursesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: courseStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- Authoring responses ----------

export const adminCategorySchema = categorySchema.extend({
  isActive: z.boolean(),
  displayOrder: z.number().int(),
  courseCount: z.number().int(),
});

export const publishIssueSchema = z.object({
  /** Where the problem is: "course.summary", "module:<id>", "lesson:<id>.content" ... */
  path: z.string(),
  message: z.string(),
});
export type PublishIssue = z.infer<typeof publishIssueSchema>;

const personSchema = z.object({
  id: z.uuid(),
  displayName: z.string().nullable(),
  email: z.string(),
});

export const adminCourseSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  status: courseStatusSchema,
  category: categorySchema.pick({ id: true, slug: true, name: true }),
  level: courseLevelSchema,
  owner: personSchema,
  liveVersion: z.number().int().nullable(),
  hasUnpublishedChanges: z.boolean(),
  moduleCount: z.number().int(),
  lessonCount: z.number().int(),
  updatedAt: z.iso.datetime(),
});
export type AdminCourseSummary = z.infer<typeof adminCourseSummarySchema>;

export const adminResourceSchema = snapshotResourceSchema.extend({ position: z.number().int() });
export const adminLessonSchema = snapshotLessonSchema.extend({
  moduleId: z.uuid(),
  position: z.number().int(),
  resources: z.array(adminResourceSchema),
});
export type AdminLesson = z.infer<typeof adminLessonSchema>;
export const adminModuleSchema = snapshotModuleSchema.extend({
  position: z.number().int(),
  lessons: z.array(adminLessonSchema),
});
export type AdminModule = z.infer<typeof adminModuleSchema>;

export const adminCourseSchema = adminCourseSummarySchema.extend({
  summary: z.string(),
  description: z.string(),
  estimatedMinutes: z.number().int(),
  outcomes: z.array(z.string()),
  prerequisites: z.array(z.string()),
  keywords: z.array(z.string()),
  featuredRank: z.number().int().nullable(),
  draftRevision: z.number().int(),
  slugLocked: z.boolean(),
  reviewRequestedAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  modules: z.array(adminModuleSchema),
  /** Module quizzes and course-level assessments, with their questions and answer keys. */
  assessments: z.array(adminAssessmentSchema),
  /** What blocks publishing right now (empty when the course can be published). */
  publishIssues: z.array(publishIssueSchema),
  permissions: z.object({ canPublish: z.boolean(), canArchive: z.boolean() }),
});
export type AdminCourse = z.infer<typeof adminCourseSchema>;

export const courseVersionSummarySchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  title: z.string(),
  publishedAt: z.iso.datetime(),
  publishedBy: personSchema.nullable(),
  live: z.boolean(),
});
