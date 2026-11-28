import {
  COURSE_SNAPSHOT_SCHEMA_VERSION,
  type AdminCourse,
  type AdminCourseSummary,
  type CourseSnapshot,
  type LessonContent,
  type PublishIssue,
} from '@luminai/contracts';
import { Prisma } from '@luminai/database';

/** Deterministic order: position first, then id to break any tie. */
export const BY_POSITION = [{ position: 'asc' }, { id: 'asc' }] as const satisfies (
  Prisma.ModuleOrderByWithRelationInput | Prisma.LessonOrderByWithRelationInput
)[];

const personSelect = {
  id: true,
  email: true,
  profile: { select: { displayName: true } },
} satisfies Prisma.UserSelect;

/** Everything needed to show, validate or publish a course's working copy. */
export const courseTreeInclude = {
  category: { select: { id: true, slug: true, name: true, isActive: true } },
  owner: { select: personSelect },
  publishedVersion: { select: { version: true } },
  modules: {
    orderBy: [...BY_POSITION],
    include: {
      lessons: {
        orderBy: [...BY_POSITION],
        include: { resources: { orderBy: [...BY_POSITION] } },
      },
    },
  },
} satisfies Prisma.CourseInclude;

export type CourseTree = Prisma.CourseGetPayload<{ include: typeof courseTreeInclude }>;
type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;

export const courseSummaryInclude = {
  category: { select: { id: true, slug: true, name: true } },
  owner: { select: personSelect },
  publishedVersion: { select: { version: true } },
  _count: { select: { modules: true } },
  modules: { select: { _count: { select: { lessons: true } } } },
} satisfies Prisma.CourseInclude;

export type CourseSummaryRow = Prisma.CourseGetPayload<{ include: typeof courseSummaryInclude }>;

export function toPerson(row: PersonRow) {
  return { id: row.id, email: row.email, displayName: row.profile?.displayName ?? null };
}

function hasUnpublishedChanges(row: {
  publishedVersionId: string | null;
  draftRevision: number;
  publishedRevision: number | null;
}): boolean {
  return row.publishedVersionId !== null && row.draftRevision !== row.publishedRevision;
}

export function toAdminCourseSummary(row: CourseSummaryRow): AdminCourseSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    category: row.category,
    level: row.level,
    owner: toPerson(row.owner),
    liveVersion: row.publishedVersion?.version ?? null,
    hasUnpublishedChanges: hasUnpublishedChanges(row),
    moduleCount: row._count.modules,
    lessonCount: row.modules.reduce((sum, module) => sum + module._count.lessons, 0),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Stored content was validated on write; this narrows the JSON column's type. */
function lessonContent(value: Prisma.JsonValue): LessonContent {
  return value as unknown as LessonContent;
}

export function toAdminCourse(
  tree: CourseTree,
  permissions: { canPublish: boolean; canArchive: boolean },
): AdminCourse {
  const modules = tree.modules.map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    isRequired: module.isRequired,
    position: module.position,
    lessons: module.lessons.map((lesson) => ({
      id: lesson.id,
      moduleId: lesson.moduleId,
      title: lesson.title,
      type: lesson.type,
      objectives: lesson.objectives,
      content: lessonContent(lesson.content),
      estimatedMinutes: lesson.estimatedMinutes,
      completionRule: lesson.completionRule,
      isRequired: lesson.isRequired,
      position: lesson.position,
      resources: lesson.resources.map((resource) => ({
        id: resource.id,
        type: resource.type,
        title: resource.title,
        storageKey: resource.storageKey,
        externalUrl: resource.externalUrl,
        mimeType: resource.mimeType,
        sizeBytes: resource.sizeBytes,
        position: resource.position,
      })),
    })),
  }));
  return {
    id: tree.id,
    slug: tree.slug,
    title: tree.title,
    status: tree.status,
    category: { id: tree.category.id, slug: tree.category.slug, name: tree.category.name },
    level: tree.level,
    owner: toPerson(tree.owner),
    liveVersion: tree.publishedVersion?.version ?? null,
    hasUnpublishedChanges: hasUnpublishedChanges(tree),
    moduleCount: modules.length,
    lessonCount: modules.reduce((sum, module) => sum + module.lessons.length, 0),
    updatedAt: tree.updatedAt.toISOString(),
    summary: tree.summary,
    description: tree.description,
    estimatedMinutes: tree.estimatedMinutes,
    outcomes: tree.outcomes,
    prerequisites: tree.prerequisites,
    keywords: tree.keywords,
    featuredRank: tree.featuredRank,
    draftRevision: tree.draftRevision,
    slugLocked: tree.firstPublishedAt !== null,
    reviewRequestedAt: tree.reviewRequestedAt?.toISOString() ?? null,
    publishedAt: tree.publishedAt?.toISOString() ?? null,
    modules,
    publishIssues: findPublishIssues(tree),
    permissions,
  };
}

/** The working copy in the immutable published shape. */
export function buildSnapshot(tree: CourseTree): CourseSnapshot {
  return {
    snapshotSchemaVersion: COURSE_SNAPSHOT_SCHEMA_VERSION,
    course: {
      id: tree.id,
      slug: tree.slug,
      title: tree.title,
      summary: tree.summary,
      description: tree.description,
      categoryId: tree.categoryId,
      level: tree.level,
      estimatedMinutes: tree.estimatedMinutes,
      outcomes: tree.outcomes,
      prerequisites: tree.prerequisites,
      keywords: tree.keywords,
      coverObjectKey: tree.coverObjectKey,
    },
    modules: tree.modules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      isRequired: module.isRequired,
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        objectives: lesson.objectives,
        content: lessonContent(lesson.content),
        estimatedMinutes: lesson.estimatedMinutes,
        completionRule: lesson.completionRule,
        isRequired: lesson.isRequired,
        resources: lesson.resources.map((resource) => ({
          id: resource.id,
          type: resource.type,
          title: resource.title,
          storageKey: resource.storageKey,
          externalUrl: resource.externalUrl,
          mimeType: resource.mimeType,
          sizeBytes: resource.sizeBytes,
        })),
      })),
    })),
  };
}

// ---------- Publish validation ----------

type ValidatableLesson = Pick<
  CourseTree['modules'][number]['lessons'][number],
  'id' | 'title' | 'type' | 'content' | 'estimatedMinutes' | 'completionRule'
> & { resources: { type: string }[] };

export interface ValidatableCourse {
  title: string;
  summary: string;
  description: string;
  estimatedMinutes: number;
  outcomes: string[];
  category: { isActive: boolean };
  modules: { id: string; title: string; lessons: ValidatableLesson[] }[];
}

const MEDIA_TYPES = new Set(['VIDEO', 'AUDIO']);

function lessonIssues(lesson: ValidatableLesson): string[] {
  const issues: string[] = [];
  const has = (type: string) => lesson.resources.some((resource) => resource.type === type);
  const blocks = lessonContent(lesson.content).blocks?.length ?? 0;

  if (lesson.estimatedMinutes <= 0) issues.push('Set how many minutes the lesson takes.');
  switch (lesson.type) {
    case 'TEXT':
    case 'INTERACTIVE':
      if (blocks === 0) issues.push('Add some lesson content.');
      break;
    case 'VIDEO':
      if (!has('VIDEO')) issues.push('Add the video.');
      if (!has('CAPTIONS') && !has('TRANSCRIPT')) {
        issues.push('Add captions or a transcript, so everyone can follow the video.');
      }
      break;
    case 'AUDIO':
      if (!has('AUDIO')) issues.push('Add the audio.');
      if (!has('TRANSCRIPT')) issues.push('Add a transcript, so everyone can follow the audio.');
      break;
    case 'EXTERNAL_LINK':
      if (!has('LINK')) issues.push('Add the link learners should open.');
      break;
  }
  if (lesson.completionRule === 'MEDIA_FINISHED' && !MEDIA_TYPES.has(lesson.type)) {
    issues.push('"Finish the media" only works for video and audio lessons.');
  }
  return issues;
}

/**
 * Everything that stops a course from being published. Empty means publishable.
 * Paths name where to fix it: `course.<field>`, `module:<id>` or `lesson:<id>`.
 */
export function findPublishIssues(course: ValidatableCourse): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (!course.summary.trim()) add('course.summary', 'Add a short summary.');
  if (!course.description.trim()) add('course.description', 'Add a description.');
  if (course.outcomes.length === 0) add('course.outcomes', 'Add at least one learning outcome.');
  if (course.estimatedMinutes <= 0) {
    add('course.estimatedMinutes', 'Set the estimated learning time.');
  }
  if (!course.category.isActive) add('course.categoryId', 'Choose an active category.');
  if (course.modules.length === 0) add('course.modules', 'Add at least one module.');

  for (const module of course.modules) {
    if (module.lessons.length === 0) {
      add(`module:${module.id}`, `Module "${module.title}" needs at least one lesson.`);
    }
    for (const lesson of module.lessons) {
      for (const message of lessonIssues(lesson)) {
        add(`lesson:${lesson.id}`, `${lesson.title}: ${message}`);
      }
    }
  }
  return issues;
}

/** Text the catalogue searches besides the title (summary, keywords, outcomes, category). */
export function searchTextFor(tree: CourseTree): string {
  return [tree.summary, tree.keywords.join(' '), tree.outcomes.join(' '), tree.category.name]
    .filter(Boolean)
    .join(' \n ');
}
