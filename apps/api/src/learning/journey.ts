import type {
  CourseProgress,
  CourseSnapshot,
  LearnerModuleOutline,
  NextLesson,
  ProgressState,
} from '@luminai/contracts';

/**
 * Pure rules for a learner's way through a published course: lesson and module
 * states, module locks, course progress and the lesson to resume. No database
 * access, so every rule is unit-tested (journey.spec.ts).
 */

export interface ProgressRow {
  lessonId: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
}

type SnapshotModule = CourseSnapshot['modules'][number];
type SnapshotLesson = SnapshotModule['lessons'][number];

export interface PlacedLesson {
  lesson: SnapshotLesson;
  module: SnapshotModule;
  /** 1-based. */
  moduleNumber: number;
  lessonNumber: number;
  /** Counts towards course completion: the lesson and its module are both required. */
  required: boolean;
  state: ProgressState;
  locked: boolean;
}

export interface Journey {
  modules: LearnerModuleOutline[];
  /** Every lesson in course order. */
  lessons: PlacedLesson[];
  progress: CourseProgress;
  /** Every lesson that counts towards completion is complete. */
  complete: boolean;
  nextLesson: NextLesson | null;
}

function stateOf(row: ProgressRow | undefined): ProgressState {
  if (!row) return 'NOT_STARTED';
  return row.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
}

/**
 * Builds the learner's journey through `snapshot`.
 *
 * - A lesson counts towards completion when it and its module are required. A
 *   course with no required lessons counts all of its lessons instead.
 * - Modules open in order: a module is locked while a required module before it
 *   has required lessons left. Lessons the learner already started stay open, so a
 *   republished course never takes away a lesson someone is part-way through.
 * - The next lesson is the last lesson opened if it isn't finished, otherwise the
 *   first open, unfinished lesson after it, otherwise the first one in the course.
 */
export function buildJourney(
  snapshot: CourseSnapshot,
  rows: readonly ProgressRow[],
  lastLessonId: string | null,
): Journey {
  const byLesson = new Map(rows.map((row) => [row.lessonId, row]));
  const anyRequired = snapshot.modules.some(
    (module) => module.isRequired && module.lessons.some((lesson) => lesson.isRequired),
  );

  const lessons: PlacedLesson[] = [];
  const modules: LearnerModuleOutline[] = [];
  let blocked = false;

  snapshot.modules.forEach((module, moduleIndex) => {
    const moduleLocked = blocked;
    const placed = module.lessons.map((lesson, lessonIndex): PlacedLesson => {
      const state = stateOf(byLesson.get(lesson.id));
      return {
        lesson,
        module,
        moduleNumber: moduleIndex + 1,
        lessonNumber: lessonIndex + 1,
        required: anyRequired ? module.isRequired && lesson.isRequired : true,
        state,
        locked: moduleLocked && state === 'NOT_STARTED',
      };
    });
    lessons.push(...placed);

    const counted = placed.some((item) => item.required)
      ? placed.filter((p) => p.required)
      : placed;
    const moduleDone = counted.length > 0 && counted.every((item) => item.state === 'COMPLETED');
    const started = placed.some((item) => item.state !== 'NOT_STARTED');
    if (placed.some((item) => item.required && item.state !== 'COMPLETED')) blocked = true;

    modules.push({
      id: module.id,
      title: module.title,
      description: module.description,
      isRequired: module.isRequired,
      state: moduleDone ? 'COMPLETED' : started ? 'IN_PROGRESS' : 'NOT_STARTED',
      locked: moduleLocked && !started,
      lessons: placed.map((item) => ({
        id: item.lesson.id,
        title: item.lesson.title,
        type: item.lesson.type,
        estimatedMinutes: item.lesson.estimatedMinutes,
        isRequired: item.required,
        state: item.state,
        locked: item.locked,
      })),
    });
  });

  const required = lessons.filter((item) => item.required);
  const done = required.filter((item) => item.state === 'COMPLETED');
  const complete = required.length > 0 && done.length === required.length;
  const progress: CourseProgress = {
    completedLessons: done.length,
    requiredLessons: required.length,
    totalLessons: lessons.length,
    percent: required.length ? Math.floor((done.length * 100) / required.length) : 0,
    remainingMinutes: required
      .filter((item) => item.state !== 'COMPLETED')
      .reduce((sum, item) => sum + item.lesson.estimatedMinutes, 0),
  };

  return { modules, lessons, progress, complete, nextLesson: pickNext(lessons, lastLessonId) };
}

function pickNext(lessons: PlacedLesson[], lastLessonId: string | null): NextLesson | null {
  const open = (item: PlacedLesson) => !item.locked && item.state !== 'COMPLETED';
  const lastIndex = lastLessonId
    ? lessons.findIndex((item) => item.lesson.id === lastLessonId)
    : -1;
  const candidate =
    (lastIndex >= 0 && open(lessons[lastIndex]!) ? lessons[lastIndex] : undefined) ??
    lessons.slice(lastIndex + 1).find(open) ??
    lessons.find(open);
  if (!candidate) return null;
  return {
    id: candidate.lesson.id,
    title: candidate.lesson.title,
    type: candidate.lesson.type,
    estimatedMinutes: candidate.lesson.estimatedMinutes,
    moduleNumber: candidate.moduleNumber,
    lessonNumber: candidate.lessonNumber,
    moduleTitle: candidate.module.title,
    state: candidate.state,
  };
}
