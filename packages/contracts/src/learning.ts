import { z } from 'zod';
import {
  categorySchema,
  completionRuleSchema,
  courseLevelSchema,
  lessonTypeSchema,
  resourceTypeSchema,
} from './catalog.js';
import { lessonContentSchema } from './content.js';

/**
 * Enrolment, lesson access and progress (Phase 4).
 * Rules are described in docs/architecture/learning-journey.md.
 */

export const ENROLLMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'WITHDRAWN'] as const;
export const enrollmentStatusSchema = z.enum(ENROLLMENT_STATUSES);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;

/** A lesson's or module's state for the signed-in learner. */
export const PROGRESS_STATES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export const progressStateSchema = z.enum(PROGRESS_STATES);
export type ProgressState = z.infer<typeof progressStateSchema>;

/**
 * "Finish the media" completes a lesson once the learner has played this much of it.
 * Allows for players that stop a second or two before the very end.
 */
export const MEDIA_FINISHED_PERCENT = 95;

export const enrollmentSchema = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  status: enrollmentStatusSchema,
  enrolledAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  lastActivityAt: z.iso.datetime(),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

/** Course progress counts required lessons only (lessons in optional modules are optional). */
export const courseProgressSchema = z.object({
  completedLessons: z.number().int(),
  requiredLessons: z.number().int(),
  totalLessons: z.number().int(),
  /** 0–100, rounded down so a course never shows 100% before it is complete. */
  percent: z.number().int().min(0).max(100),
  /** Estimated minutes left in the required lessons that aren't complete. */
  remainingMinutes: z.number().int(),
});
export type CourseProgress = z.infer<typeof courseProgressSchema>;

/** Where to pick up: the lesson to open next, with its place in the course. */
export const nextLessonSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  type: lessonTypeSchema,
  estimatedMinutes: z.number().int(),
  /** 1-based module number and lesson number within the module. */
  moduleNumber: z.number().int(),
  lessonNumber: z.number().int(),
  moduleTitle: z.string(),
  state: progressStateSchema,
});
export type NextLesson = z.infer<typeof nextLessonSchema>;

const courseHeaderSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  category: categorySchema.pick({ id: true, slug: true, name: true }),
  level: courseLevelSchema,
  estimatedMinutes: z.number().int(),
  version: z.number().int(),
});

// ---------- The learner's view of an enrolled course ----------

export const learnerLessonOutlineSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  type: lessonTypeSchema,
  estimatedMinutes: z.number().int(),
  isRequired: z.boolean(),
  state: progressStateSchema,
  locked: z.boolean(),
});
export type LearnerLessonOutline = z.infer<typeof learnerLessonOutlineSchema>;

export const learnerModuleOutlineSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  isRequired: z.boolean(),
  state: progressStateSchema,
  /** Modules open in order: a module is locked until the required modules before it are done. */
  locked: z.boolean(),
  lessons: z.array(learnerLessonOutlineSchema),
});
export type LearnerModuleOutline = z.infer<typeof learnerModuleOutlineSchema>;

export const learnerCourseSchema = courseHeaderSchema.extend({
  enrollment: enrollmentSchema,
  progress: courseProgressSchema,
  /** Null once every lesson the learner can open is complete. */
  nextLesson: nextLessonSchema.nullable(),
  modules: z.array(learnerModuleOutlineSchema),
});
export type LearnerCourse = z.infer<typeof learnerCourseSchema>;

/** One row on the dashboard and on My learning. */
export const enrolledCourseSchema = courseHeaderSchema.extend({
  enrollment: enrollmentSchema,
  progress: courseProgressSchema,
  nextLesson: nextLessonSchema.nullable(),
});
export type EnrolledCourse = z.infer<typeof enrolledCourseSchema>;

// ---------- A lesson opened in the player ----------

export const lessonProgressSchema = z.object({
  state: progressStateSchema,
  progressPercent: z.number().int().min(0).max(100),
  positionSeconds: z.number().int().nullable(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type LessonProgress = z.infer<typeof lessonProgressSchema>;

export const learnerResourceSchema = z.object({
  id: z.uuid(),
  type: resourceTypeSchema,
  title: z.string(),
  /** An https URL that passed the safe URL policy when it was authored. */
  url: z.string().nullable(),
  mimeType: z.string().nullable(),
});
export type LearnerResource = z.infer<typeof learnerResourceSchema>;

export const learnerLessonSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  type: lessonTypeSchema,
  objectives: z.array(z.string()),
  content: lessonContentSchema,
  estimatedMinutes: z.number().int(),
  completionRule: completionRuleSchema,
  isRequired: z.boolean(),
  resources: z.array(learnerResourceSchema),
  course: z.object({ id: z.uuid(), slug: z.string(), title: z.string() }),
  module: z.object({
    id: z.uuid(),
    title: z.string(),
    number: z.number().int(),
    lessonCount: z.number().int(),
  }),
  /** 1-based position within the module. */
  lessonNumber: z.number().int(),
  previousLessonId: z.uuid().nullable(),
  /** The next lesson in course order, and whether it is still locked. */
  next: z.object({ id: z.uuid(), title: z.string(), locked: z.boolean() }).nullable(),
  progress: lessonProgressSchema,
});
export type LearnerLesson = z.infer<typeof learnerLessonSchema>;

// ---------- Progress writes ----------

/**
 * PUT /lessons/{lessonId}/progress. Every field is optional and the write is
 * idempotent: progress never goes backwards and a completed lesson stays complete,
 * so retries and out-of-order writes from several tabs are safe.
 */
export const updateLessonProgressRequestSchema = z
  .object({
    /** Playback position, for resuming video and audio. */
    positionSeconds: z.number().int().min(0).max(86_400).optional(),
    /** How much of the media has been played (0–100). */
    progressPercent: z.number().int().min(0).max(100).optional(),
    /** Ask to complete the lesson. Allowed when the lesson's completion rule is met. */
    completed: z.literal(true).optional(),
  })
  .strict();
export type UpdateLessonProgressRequest = z.infer<typeof updateLessonProgressRequestSchema>;

export const lessonProgressResultSchema = z.object({
  lessonId: z.uuid(),
  progress: lessonProgressSchema,
  course: z.object({
    progress: courseProgressSchema,
    enrollmentStatus: enrollmentStatusSchema,
    completedAt: z.iso.datetime().nullable(),
    nextLesson: nextLessonSchema.nullable(),
  }),
});
export type LessonProgressResult = z.infer<typeof lessonProgressResultSchema>;

export const myEnrollmentsQuerySchema = z.object({
  status: z.enum(['in-progress', 'completed']).optional(),
});
