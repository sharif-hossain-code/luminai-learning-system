import { z } from 'zod';
import { multilineText, plainText } from './content.js';

/**
 * Assessments (Phase 5): quizzes authored in the course studio, published in the
 * course snapshot and taken by enrolled learners. Rules are described in
 * docs/architecture/assessments.md and ADR-006.
 *
 * Answer keys (`answerKey`) exist only in the authoring and snapshot shapes. The
 * learner shapes below are built field by field on the server and never carry them.
 */

// ---------- Enumerations (values match the database enums) ----------

export const QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'SHORT_TEXT',
  'WRITING',
] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof questionTypeSchema>;

/** Question types that are scored. Writing answers get rubric feedback instead. */
export const SCORED_QUESTION_TYPES: readonly QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'SHORT_TEXT',
];
export const isScoredType = (type: QuestionType) => type !== 'WRITING';
export const isChoiceType = (type: QuestionType) =>
  type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE';

export const FEEDBACK_MODES = ['SCORE_ONLY', 'CORRECTNESS', 'FULL'] as const;
export const feedbackModeSchema = z.enum(FEEDBACK_MODES);
export type FeedbackMode = z.infer<typeof feedbackModeSchema>;

export const ATTEMPT_STATUSES = ['IN_PROGRESS', 'SUBMITTED'] as const;
export const attemptStatusSchema = z.enum(ATTEMPT_STATUSES);
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;

/** True/false questions always have these two options. */
export const TRUE_FALSE_OPTIONS = [
  { id: 'true', text: 'True' },
  { id: 'false', text: 'False' },
] as const;

export const QUESTION_LIMITS = {
  questionsPerAssessment: 50,
  optionsPerQuestion: 10,
  acceptedAnswers: 20,
  rubricCriteria: 8,
  /** Characters in a typed answer. */
  shortTextAnswer: 200,
  writingAnswer: 5000,
} as const;

// ---------- Question parts ----------

/** Option ids are short, stable, URL-safe strings (the editor uses random ids). */
export const optionIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Option ids are lower-case letters, numbers and hyphens.');

export const questionOptionSchema = z
  .object({ id: optionIdSchema, text: plainText(300, 'An option') })
  .strict();
export type QuestionOption = z.infer<typeof questionOptionSchema>;

/** The protected part of a question. Kept on the server, never sent to learners before review. */
export const answerKeySchema = z
  .object({
    /** Choice and true/false questions. */
    correctOptionIds: z.array(optionIdSchema).max(QUESTION_LIMITS.optionsPerQuestion).optional(),
    /** Short-answer questions: any of these is correct (case, spacing and end punctuation ignored). */
    acceptedAnswers: z
      .array(plainText(QUESTION_LIMITS.shortTextAnswer, 'An accepted answer'))
      .max(QUESTION_LIMITS.acceptedAnswers, `Add at most ${QUESTION_LIMITS.acceptedAnswers}.`)
      .optional(),
  })
  .strict();
export type AnswerKey = z.infer<typeof answerKeySchema>;

export const rubricCriterionSchema = z
  .object({
    id: optionIdSchema,
    label: plainText(120, 'A criterion'),
    description: multilineText(500, 'The description').default(''),
  })
  .strict();
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

/** Writing questions: what good looks like. Shown to learners and given to the feedback model. */
export const rubricSchema = z
  .object({
    criteria: z
      .array(rubricCriterionSchema)
      .max(QUESTION_LIMITS.rubricCriteria, `Add at most ${QUESTION_LIMITS.rubricCriteria}.`)
      .default([]),
    minWords: z.number().int().min(1).max(2000).nullable().default(null),
    maxWords: z.number().int().min(1).max(2000).nullable().default(null),
  })
  .strict();
export type Rubric = z.infer<typeof rubricSchema>;

// ---------- Published snapshot (inside course_versions.snapshot) ----------

export const snapshotQuestionSchema = z.object({
  id: z.uuid(),
  type: questionTypeSchema,
  prompt: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  answerKey: z.object({
    correctOptionIds: z.array(z.string()).optional(),
    acceptedAnswers: z.array(z.string()).optional(),
  }),
  explanation: z.string(),
  rubric: z.object({
    criteria: z.array(z.object({ id: z.string(), label: z.string(), description: z.string() })),
    minWords: z.number().int().nullable(),
    maxWords: z.number().int().nullable(),
  }),
  points: z.number().int(),
});
export type SnapshotQuestion = z.infer<typeof snapshotQuestionSchema>;

export const snapshotAssessmentSchema = z.object({
  id: z.uuid(),
  /** Null: a course-level (final) assessment, taken after the last module. */
  moduleId: z.uuid().nullable(),
  title: z.string(),
  instructions: z.string(),
  isRequired: z.boolean(),
  passPercent: z.number().int(),
  maxAttempts: z.number().int().nullable(),
  feedbackMode: feedbackModeSchema,
  estimatedMinutes: z.number().int(),
  questions: z.array(snapshotQuestionSchema),
});
export type SnapshotAssessment = z.infer<typeof snapshotAssessmentSchema>;

// ---------- Authoring ----------

export const createAssessmentRequestSchema = z
  .object({
    title: plainText(120, 'The title'),
    /** The module the quiz ends; null for a course-level (final) assessment. */
    moduleId: z.uuid().nullable(),
  })
  .strict();
export type CreateAssessmentRequest = z.infer<typeof createAssessmentRequestSchema>;

export const updateAssessmentRequestSchema = z
  .object({
    title: plainText(120, 'The title'),
    instructions: multilineText(2000, 'The instructions'),
    /** Moves the assessment to another module of the same course, or to the course level. */
    moduleId: z.uuid().nullable(),
    isRequired: z.boolean(),
    passPercent: z
      .number()
      .int()
      .min(0, 'Use a pass mark from 0 to 100.')
      .max(100, 'Use a pass mark from 0 to 100.'),
    /** Null for unlimited attempts. */
    maxAttempts: z.number().int().min(1).max(20).nullable(),
    feedbackMode: feedbackModeSchema,
    estimatedMinutes: z.number().int().min(0).max(1000),
  })
  .partial()
  .strict();
export type UpdateAssessmentRequest = z.infer<typeof updateAssessmentRequestSchema>;

export const createQuestionRequestSchema = z.object({ type: questionTypeSchema }).strict();

/**
 * Saves a question. The editor sends the whole question; anything left out keeps
 * its value. Drafts may be incomplete (no correct option yet): publish validation
 * lists what is missing.
 */
export const updateQuestionRequestSchema = z
  .object({
    type: questionTypeSchema,
    prompt: multilineText(2000, 'The question'),
    options: z
      .array(questionOptionSchema)
      .max(
        QUESTION_LIMITS.optionsPerQuestion,
        `Add at most ${QUESTION_LIMITS.optionsPerQuestion} options.`,
      )
      .refine((options) => new Set(options.map((o) => o.id)).size === options.length, {
        message: 'Each option needs its own id.',
      }),
    answerKey: answerKeySchema,
    explanation: multilineText(2000, 'The explanation'),
    rubric: rubricSchema,
    points: z.number().int().min(0).max(100),
  })
  .partial()
  .strict();
export type UpdateQuestionRequest = z.infer<typeof updateQuestionRequestSchema>;

export const adminQuestionSchema = snapshotQuestionSchema.extend({ position: z.number().int() });
export type AdminQuestion = z.infer<typeof adminQuestionSchema>;

export const adminAssessmentSchema = snapshotAssessmentSchema.extend({
  position: z.number().int(),
  questions: z.array(adminQuestionSchema),
});
export type AdminAssessment = z.infer<typeof adminAssessmentSchema>;

// ---------- Learner views (no answer keys) ----------

/** A learner's response to one question. */
export const answerResponseSchema = z.union([
  z
    .object({
      optionIds: z
        .array(z.string().max(40))
        .max(QUESTION_LIMITS.optionsPerQuestion)
        .refine((ids) => new Set(ids).size === ids.length, 'Choose each option once.'),
    })
    .strict(),
  z
    .object({
      text: z
        .string()
        .max(QUESTION_LIMITS.writingAnswer, 'Your answer is too long.')
        .transform((value) => value.normalize('NFC').replace(/\r\n?/g, '\n')),
    })
    .strict(),
]);
export type AnswerResponse = z.infer<typeof answerResponseSchema>;

export const saveAnswerRequestSchema = z.object({ response: answerResponseSchema }).strict();
export type SaveAnswerRequest = z.infer<typeof saveAnswerRequestSchema>;

export const submitAttemptRequestSchema = z
  .object({
    /** Final answers to save before scoring (optional: autosaved answers are used otherwise). */
    answers: z
      .array(z.object({ questionId: z.uuid(), response: answerResponseSchema }).strict())
      .max(QUESTION_LIMITS.questionsPerAssessment)
      .optional(),
  })
  .strict();
export type SubmitAttemptRequest = z.infer<typeof submitAttemptRequestSchema>;

export const learnerQuestionSchema = z.object({
  id: z.uuid(),
  /** 1-based. */
  number: z.number().int(),
  type: questionTypeSchema,
  prompt: z.string(),
  points: z.number().int(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  /** Writing questions only: the rubric criteria (what good looks like) and word limits. */
  rubric: z
    .object({
      criteria: z.array(z.object({ id: z.string(), label: z.string(), description: z.string() })),
      minWords: z.number().int().nullable(),
      maxWords: z.number().int().nullable(),
    })
    .nullable(),
});
export type LearnerQuestion = z.infer<typeof learnerQuestionSchema>;

export const FEEDBACK_RATINGS = ['MET', 'PARTLY', 'NOT_YET'] as const;
export const feedbackRatingSchema = z.enum(FEEDBACK_RATINGS);
export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;

/**
 * Rubric-based feedback on a writing answer. Always marked as AI-generated, one
 * entry per rubric criterion and nothing outside the rubric, and never a score.
 */
export const aiFeedbackSchema = z.object({
  generatedBy: z.literal('AI'),
  status: z.enum(['READY', 'UNAVAILABLE']),
  /** Which provider wrote it ("mock" until an AI provider is chosen, assumption A6). */
  provider: z.string(),
  criteria: z.array(
    z.object({
      criterionId: z.string(),
      label: z.string(),
      rating: feedbackRatingSchema,
      comment: z.string(),
    }),
  ),
  summary: z.string().nullable(),
  /** Shown with the feedback: what it is and how far to trust it. */
  notice: z.string(),
  generatedAt: z.iso.datetime(),
});
export type AiFeedback = z.infer<typeof aiFeedbackSchema>;

export const questionResultSchema = z.object({
  questionId: z.uuid(),
  /** Null for questions that aren't scored (writing). */
  isCorrect: z.boolean().nullable(),
  awardedPoints: z.number().int(),
  /** Only when the feedback mode allows it and the answers are revealed. */
  correctOptionIds: z.array(z.string()).nullable(),
  acceptedAnswers: z.array(z.string()).nullable(),
  explanation: z.string().nullable(),
  aiFeedback: aiFeedbackSchema.nullable(),
});
export type QuestionResult = z.infer<typeof questionResultSchema>;

export const attemptResultSchema = z.object({
  score: z.number().int(),
  maxScore: z.number().int(),
  /** 0–100, rounded down. */
  percent: z.number().int(),
  passed: z.boolean(),
  passPercent: z.number().int(),
  feedbackMode: feedbackModeSchema,
  /**
   * FULL mode shows the correct answers only once the learner has passed or has no
   * attempts left, so retakes stay meaningful.
   */
  answersRevealed: z.boolean(),
  /** Per-question results; null when the feedback mode is SCORE_ONLY. */
  questions: z.array(questionResultSchema).nullable(),
});
export type AttemptResult = z.infer<typeof attemptResultSchema>;

export const attemptSummarySchema = z.object({
  id: z.uuid(),
  attemptNumber: z.number().int(),
  status: attemptStatusSchema,
  startedAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
  score: z.number().int().nullable(),
  maxScore: z.number().int(),
  percent: z.number().int().nullable(),
  passed: z.boolean().nullable(),
});
export type AttemptSummary = z.infer<typeof attemptSummarySchema>;

const placeSchema = z.object({
  course: z.object({ id: z.uuid(), slug: z.string(), title: z.string() }),
  /** Null for a course-level (final) assessment. */
  module: z.object({ id: z.uuid(), title: z.string(), number: z.number().int() }).nullable(),
});

/** A step before or after the assessment in course order. */
export const stepLinkSchema = z.object({
  kind: z.enum(['LESSON', 'ASSESSMENT']),
  id: z.uuid(),
  title: z.string(),
  locked: z.boolean(),
});
export type StepLink = z.infer<typeof stepLinkSchema>;

/** GET /assessments/{id}: the start page. Questions come with an attempt. */
export const learnerAssessmentSchema = placeSchema.extend({
  id: z.uuid(),
  title: z.string(),
  instructions: z.string(),
  estimatedMinutes: z.number().int(),
  isRequired: z.boolean(),
  questionCount: z.number().int(),
  maxScore: z.number().int(),
  passPercent: z.number().int(),
  maxAttempts: z.number().int().nullable(),
  feedbackMode: feedbackModeSchema,
  passed: z.boolean(),
  bestPercent: z.number().int().nullable(),
  /** Submitted attempts. */
  attemptsUsed: z.number().int(),
  /** Null for unlimited. */
  attemptsLeft: z.number().int().nullable(),
  /** An attempt in progress, to resume. */
  openAttempt: z
    .object({ id: z.uuid(), attemptNumber: z.number().int(), answeredCount: z.number().int() })
    .nullable(),
  /** Submitted attempts, newest first. */
  attempts: z.array(attemptSummarySchema),
  previous: stepLinkSchema.nullable(),
  next: stepLinkSchema.nullable(),
});
export type LearnerAssessment = z.infer<typeof learnerAssessmentSchema>;

/** GET /attempts/{id}: the questions of the pinned version, saved answers and, once submitted, the result. */
export const attemptSchema = placeSchema.extend({
  id: z.uuid(),
  assessmentId: z.uuid(),
  title: z.string(),
  attemptNumber: z.number().int(),
  maxAttempts: z.number().int().nullable(),
  passPercent: z.number().int(),
  status: attemptStatusSchema,
  startedAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
  questions: z.array(learnerQuestionSchema),
  answers: z.array(z.object({ questionId: z.uuid(), response: answerResponseSchema })),
  result: attemptResultSchema.nullable(),
});
export type Attempt = z.infer<typeof attemptSchema>;

/** One "Up next" row on the dashboard: an open, required assessment not passed yet. */
export const upNextAssessmentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  questionCount: z.number().int(),
  estimatedMinutes: z.number().int(),
  inProgress: z.boolean(),
  course: z.object({ id: z.uuid(), slug: z.string(), title: z.string() }),
});
export type UpNextAssessment = z.infer<typeof upNextAssessmentSchema>;
