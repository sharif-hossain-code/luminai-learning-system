import type {
  CourseProgress,
  CourseSnapshot,
  LearnerAssessmentOutline,
  LearnerModuleOutline,
  NextLesson,
  ProgressState,
  SnapshotAssessment,
} from '@luminai/contracts';

/**
 * Pure rules for a learner's way through a published course: lesson, quiz and
 * module states, module locks, course progress and the step to resume. No
 * database access, so every rule is unit-tested (journey.spec.ts).
 */

export interface ProgressRow {
  lessonId: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
}

/** A learner's attempts at one assessment, summarised. */
export interface AssessmentRow {
  assessmentId: string;
  /** Any submitted attempt passed. */
  passed: boolean;
  /** Submitted attempts. */
  attemptsUsed: number;
  /** An attempt is open right now. */
  open: boolean;
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

export interface PlacedAssessment {
  assessment: SnapshotAssessment;
  /** Null for a course-level (final) assessment. */
  module: SnapshotModule | null;
  moduleNumber: number | null;
  /** Counts towards completion: required, and in a required module (or course-level). */
  required: boolean;
  /** COMPLETED once passed. */
  state: ProgressState;
  locked: boolean;
  passed: boolean;
  attemptsUsed: number;
  /** Null for unlimited. */
  attemptsLeft: number | null;
  outOfAttempts: boolean;
}

/** Every lesson and assessment in course order: a module's lessons, then its quizzes. */
export type Step =
  ({ kind: 'LESSON' } & PlacedLesson) | ({ kind: 'ASSESSMENT' } & PlacedAssessment);

export interface Journey {
  modules: LearnerModuleOutline[];
  finalAssessments: LearnerAssessmentOutline[];
  /** Every lesson in course order. */
  lessons: PlacedLesson[];
  /** Every assessment in course order. */
  assessments: PlacedAssessment[];
  /** Lessons and assessments in course order. */
  steps: Step[];
  progress: CourseProgress;
  /** Every required lesson is complete and every required assessment is passed. */
  complete: boolean;
  nextLesson: NextLesson | null;
}

function stateOf(row: ProgressRow | undefined): ProgressState {
  if (!row) return 'NOT_STARTED';
  return row.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
}

function placeAssessment(
  assessment: SnapshotAssessment,
  module: SnapshotModule | null,
  moduleNumber: number | null,
  row: AssessmentRow | undefined,
  blocked: boolean,
): PlacedAssessment {
  const passed = row?.passed ?? false;
  const attemptsUsed = row?.attemptsUsed ?? 0;
  const started = attemptsUsed > 0 || (row?.open ?? false);
  const attemptsLeft =
    assessment.maxAttempts === null ? null : Math.max(0, assessment.maxAttempts - attemptsUsed);
  return {
    assessment,
    module,
    moduleNumber,
    required: assessment.isRequired && (module ? module.isRequired : true),
    state: passed ? 'COMPLETED' : started ? 'IN_PROGRESS' : 'NOT_STARTED',
    locked: blocked && !started,
    passed,
    attemptsUsed,
    attemptsLeft,
    outOfAttempts: !passed && attemptsLeft === 0 && !(row?.open ?? false),
  };
}

function assessmentOutline(item: PlacedAssessment): LearnerAssessmentOutline {
  return {
    id: item.assessment.id,
    title: item.assessment.title,
    estimatedMinutes: item.assessment.estimatedMinutes,
    questionCount: item.assessment.questions.length,
    isRequired: item.required,
    state: item.state,
    locked: item.locked,
    outOfAttempts: item.outOfAttempts,
  };
}

/**
 * Builds the learner's journey through `snapshot`.
 *
 * - A lesson counts towards completion when it and its module are required. A
 *   course with no required lessons counts all of its lessons instead.
 * - An assessment counts when it is required and its module is required (course-level
 *   assessments only need to be required). It is done once an attempt passes.
 * - Modules open in order: a module is locked while a required module before it
 *   has required lessons left or required quizzes not passed. Course-level
 *   assessments open once every required item in the modules is done. Lessons and
 *   quizzes the learner already started stay open, so a republished course never
 *   takes away something someone is part-way through.
 * - The next step is the last lesson opened if it isn't finished, otherwise the
 *   first open, unfinished step after it (a quiz with attempts left counts),
 *   otherwise the first one in the course.
 */
export function buildJourney(
  snapshot: CourseSnapshot,
  rows: readonly ProgressRow[],
  lastLessonId: string | null,
  assessmentRows: readonly AssessmentRow[] = [],
): Journey {
  const byLesson = new Map(rows.map((row) => [row.lessonId, row]));
  const byAssessment = new Map(assessmentRows.map((row) => [row.assessmentId, row]));
  const anyRequired = snapshot.modules.some(
    (module) => module.isRequired && module.lessons.some((lesson) => lesson.isRequired),
  );
  const assessmentsOf = (moduleId: string | null) =>
    snapshot.assessments.filter((assessment) => assessment.moduleId === moduleId);

  const lessons: PlacedLesson[] = [];
  const assessments: PlacedAssessment[] = [];
  const steps: Step[] = [];
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
    const quizzes = assessmentsOf(module.id).map((assessment) =>
      placeAssessment(
        assessment,
        module,
        moduleIndex + 1,
        byAssessment.get(assessment.id),
        moduleLocked,
      ),
    );
    lessons.push(...placed);
    assessments.push(...quizzes);
    steps.push(
      ...placed.map((item) => ({ kind: 'LESSON' as const, ...item })),
      ...quizzes.map((item) => ({ kind: 'ASSESSMENT' as const, ...item })),
    );

    const counted = placed.some((item) => item.required)
      ? placed.filter((p) => p.required)
      : placed;
    const requiredQuizzes = quizzes.filter((item) => item.required);
    const moduleDone =
      counted.length > 0 &&
      counted.every((item) => item.state === 'COMPLETED') &&
      requiredQuizzes.every((item) => item.passed);
    const started =
      placed.some((item) => item.state !== 'NOT_STARTED') ||
      quizzes.some((item) => item.state !== 'NOT_STARTED');
    if (
      placed.some((item) => item.required && item.state !== 'COMPLETED') ||
      requiredQuizzes.some((item) => !item.passed)
    ) {
      blocked = true;
    }

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
      assessments: quizzes.map(assessmentOutline),
    });
  });

  // Course-level assessments come after every module and open once nothing required is left.
  const finals = assessmentsOf(null).map((assessment) =>
    placeAssessment(assessment, null, null, byAssessment.get(assessment.id), blocked),
  );
  assessments.push(...finals);
  steps.push(...finals.map((item) => ({ kind: 'ASSESSMENT' as const, ...item })));

  const required = lessons.filter((item) => item.required);
  const done = required.filter((item) => item.state === 'COMPLETED');
  const requiredAssessments = assessments.filter((item) => item.required);
  const passed = requiredAssessments.filter((item) => item.passed);
  const totalRequired = required.length + requiredAssessments.length;
  const totalDone = done.length + passed.length;
  const complete =
    required.length > 0 &&
    done.length === required.length &&
    passed.length === requiredAssessments.length;
  const progress: CourseProgress = {
    completedLessons: done.length,
    requiredLessons: required.length,
    totalLessons: lessons.length,
    passedAssessments: passed.length,
    requiredAssessments: requiredAssessments.length,
    percent: totalRequired ? Math.floor((totalDone * 100) / totalRequired) : 0,
    remainingMinutes:
      required
        .filter((item) => item.state !== 'COMPLETED')
        .reduce((sum, item) => sum + item.lesson.estimatedMinutes, 0) +
      requiredAssessments
        .filter((item) => !item.passed)
        .reduce((sum, item) => sum + item.assessment.estimatedMinutes, 0),
  };

  return {
    modules,
    finalAssessments: finals.map(assessmentOutline),
    lessons,
    assessments,
    steps,
    progress,
    complete,
    nextLesson: pickNext(steps, lastLessonId),
  };
}

/** A step the learner can open and still has something to do in. */
function isOpen(step: Step): boolean {
  if (step.locked || step.state === 'COMPLETED') return false;
  return step.kind === 'LESSON' || !step.outOfAttempts;
}

function pickNext(steps: Step[], lastLessonId: string | null): NextLesson | null {
  const lastIndex = lastLessonId
    ? steps.findIndex((step) => step.kind === 'LESSON' && step.lesson.id === lastLessonId)
    : -1;
  const candidate =
    (lastIndex >= 0 && isOpen(steps[lastIndex]!) ? steps[lastIndex] : undefined) ??
    steps.slice(lastIndex + 1).find(isOpen) ??
    steps.find(isOpen);
  if (!candidate) return null;
  if (candidate.kind === 'LESSON') {
    return {
      kind: 'LESSON',
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
  return {
    kind: 'ASSESSMENT',
    id: candidate.assessment.id,
    title: candidate.assessment.title,
    type: null,
    estimatedMinutes: candidate.assessment.estimatedMinutes,
    moduleNumber: candidate.moduleNumber,
    lessonNumber: null,
    moduleTitle: candidate.module?.title ?? null,
    state: candidate.state,
  };
}
