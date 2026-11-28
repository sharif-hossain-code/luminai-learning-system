import {
  COURSE_SNAPSHOT_SCHEMA_VERSION,
  isChoiceType,
  isScoredType,
  type AdminAssessment,
  type AdminCourse,
  type AdminCourseSummary,
  type CourseSnapshot,
  type LessonContent,
  type PublishIssue,
  type SnapshotAssessment,
  type SnapshotQuestion,
} from '@luminai/contracts';
import { Prisma } from '@luminai/database';

/** Deterministic order: position first, then id to break any tie. */
export const BY_POSITION = [{ position: 'asc' }, { id: 'asc' }] as const satisfies (
  | Prisma.ModuleOrderByWithRelationInput
  | Prisma.LessonOrderByWithRelationInput
  | Prisma.AssessmentOrderByWithRelationInput
  | Prisma.QuestionOrderByWithRelationInput
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
  assessments: {
    orderBy: [...BY_POSITION],
    include: { questions: { orderBy: [...BY_POSITION] } },
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

type AssessmentRow = CourseTree['assessments'][number];
type QuestionRow = AssessmentRow['questions'][number];

const asObject = (value: Prisma.JsonValue) =>
  (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<
    string,
    unknown
  >;

/** Question JSON columns were validated on write; this narrows them, filling defaults. */
export function toSnapshotQuestion(row: QuestionRow): SnapshotQuestion {
  const key = asObject(row.answerKey);
  const rubric = asObject(row.rubric);
  return {
    id: row.id,
    type: row.type,
    prompt: row.prompt,
    options: Array.isArray(row.options) ? (row.options as SnapshotQuestion['options']) : [],
    answerKey: {
      ...(Array.isArray(key.correctOptionIds)
        ? { correctOptionIds: key.correctOptionIds as string[] }
        : {}),
      ...(Array.isArray(key.acceptedAnswers)
        ? { acceptedAnswers: key.acceptedAnswers as string[] }
        : {}),
    },
    explanation: row.explanation,
    rubric: {
      criteria: Array.isArray(rubric.criteria)
        ? (rubric.criteria as SnapshotQuestion['rubric']['criteria'])
        : [],
      minWords: typeof rubric.minWords === 'number' ? rubric.minWords : null,
      maxWords: typeof rubric.maxWords === 'number' ? rubric.maxWords : null,
    },
    points: row.points,
  };
}

/** Module quizzes in module order, then course-level assessments; each in position order. */
export function orderedAssessments(tree: Pick<CourseTree, 'modules' | 'assessments'>) {
  const moduleIndex = new Map(tree.modules.map((module, index) => [module.id, index]));
  const rank = (row: AssessmentRow) =>
    row.moduleId === null ? tree.modules.length : (moduleIndex.get(row.moduleId) ?? 0);
  return [...tree.assessments].sort(
    (a, b) => rank(a) - rank(b) || a.position - b.position || a.id.localeCompare(b.id),
  );
}

export function toSnapshotAssessment(row: AssessmentRow): SnapshotAssessment {
  return {
    id: row.id,
    moduleId: row.moduleId,
    title: row.title,
    instructions: row.instructions,
    isRequired: row.isRequired,
    passPercent: row.passPercent,
    maxAttempts: row.maxAttempts,
    feedbackMode: row.feedbackMode,
    estimatedMinutes: row.estimatedMinutes,
    questions: row.questions.map(toSnapshotQuestion),
  };
}

function toAdminAssessment(row: AssessmentRow): AdminAssessment {
  return {
    ...toSnapshotAssessment(row),
    position: row.position,
    questions: row.questions.map((question) => ({
      ...toSnapshotQuestion(question),
      position: question.position,
    })),
  };
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
    assessments: orderedAssessments(tree).map(toAdminAssessment),
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
    assessments: orderedAssessments(tree).map(toSnapshotAssessment),
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
  assessments?: AssessmentRow[];
}

/** What stops one question from being published. */
export function questionIssues(question: SnapshotQuestion): string[] {
  const issues: string[] = [];
  if (!question.prompt.trim()) issues.push('write the question');
  if (isChoiceType(question.type)) {
    const ids = new Set(question.options.map((option) => option.id));
    const correct = (question.answerKey.correctOptionIds ?? []).filter((id) => ids.has(id));
    if (question.options.length < 2) issues.push('add at least two options');
    if (question.options.some((option) => !option.text.trim())) issues.push('fill in every option');
    if (correct.length === 0) issues.push('mark the correct answer');
    else if (question.type !== 'MULTIPLE_CHOICE' && correct.length > 1) {
      issues.push('mark only one correct answer');
    }
  }
  if (question.type === 'SHORT_TEXT' && !(question.answerKey.acceptedAnswers ?? []).length) {
    issues.push('add at least one accepted answer');
  }
  if (question.type === 'WRITING') {
    if (question.rubric.criteria.length === 0) issues.push('add at least one rubric criterion');
    const { minWords, maxWords } = question.rubric;
    if (minWords !== null && maxWords !== null && minWords > maxWords) {
      issues.push('make the minimum word count lower than the maximum');
    }
  }
  if (isScoredType(question.type) && question.points < 1) issues.push('give it at least 1 point');
  return issues;
}

function assessmentIssues(row: AssessmentRow): string[] {
  const issues: string[] = [];
  if (row.questions.length === 0) issues.push('Add at least one question.');
  if (row.estimatedMinutes <= 0) issues.push('Set how many minutes the quiz takes.');
  row.questions.forEach((question, index) => {
    const problems = questionIssues(toSnapshotQuestion(question));
    if (problems.length) issues.push(`Question ${index + 1}: ${problems.join(', ')}.`);
  });
  return issues;
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
  for (const assessment of course.assessments ?? []) {
    for (const message of assessmentIssues(assessment)) {
      add(`assessment:${assessment.id}`, `${assessment.title}: ${message}`);
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
