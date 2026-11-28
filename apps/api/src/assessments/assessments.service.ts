import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  answerResponseSchema,
  courseSnapshotSchema,
  ErrorCode,
  type AiFeedback,
  type AnswerResponse,
  type Attempt,
  type AttemptResult,
  type AttemptSummary,
  type LearnerAssessment,
  type LearnerQuestion,
  type SnapshotAssessment,
  type StepLink,
  type SubmitAttemptRequest,
} from '@luminai/contracts';
import { AttemptStatus, EnrollmentStatus, Prisma } from '@luminai/database';
import { AppError } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import type { PlacedAssessment, Step } from '../learning/journey.js';
import { LearningService, type LoadedEnrollment } from '../learning/learning.service.js';
import { gradeAttempt, isAnswered, maxScoreOf, responseFitsQuestion } from './grading.js';
import {
  boundFeedback,
  unavailableFeedback,
  WRITING_FEEDBACK_PROVIDER,
  type WritingFeedbackProvider,
} from './writing-feedback.js';

type AttemptRow = Prisma.AssessmentAttemptGetPayload<{ include: { answers: true } }>;
type Tx = Prisma.TransactionClient;

/** How long one writing answer may wait for feedback before it is marked unavailable. */
const FEEDBACK_TIMEOUT_MS = 15_000;

const notFound = (what = 'Attempt') =>
  new AppError(ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, `${what} not found.`);
const locked = () =>
  new AppError(
    ErrorCode.ASSESSMENT_LOCKED,
    HttpStatus.FORBIDDEN,
    'Finish the lessons and quizzes before this one to open it.',
  );
const submitted = () =>
  new AppError(
    ErrorCode.ATTEMPT_SUBMITTED,
    HttpStatus.CONFLICT,
    'This attempt has been submitted, so its answers can no longer change.',
  );
const invalidAnswer = (field: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_FAILED, HttpStatus.UNPROCESSABLE_ENTITY, message, [
    { field, message },
  ]);

/** Stored responses were validated on write; parsing keeps the type honest. */
function storedResponse(value: Prisma.JsonValue): AnswerResponse | undefined {
  const parsed = answerResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function storedFeedback(value: Prisma.JsonValue | null): AiFeedback | null {
  return value && typeof value === 'object' ? (value as unknown as AiFeedback) : null;
}

function toSummary(row: AttemptRow | Prisma.AssessmentAttemptGetPayload<object>): AttemptSummary {
  return {
    id: row.id,
    attemptNumber: row.attemptNumber,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    score: row.score,
    maxScore: row.maxScore,
    percent: row.percent,
    passed: row.passed,
  };
}

function toLearnerQuestions(assessment: SnapshotAssessment): LearnerQuestion[] {
  // Built field by field: the answer key and explanation are never copied.
  return assessment.questions.map((question, index) => ({
    id: question.id,
    number: index + 1,
    type: question.type,
    prompt: question.prompt,
    points: question.points,
    options: question.options.map((option) => ({ id: option.id, text: option.text })),
    rubric:
      question.type === 'WRITING'
        ? {
            criteria: question.rubric.criteria.map((criterion) => ({
              id: criterion.id,
              label: criterion.label,
              description: criterion.description,
            })),
            minWords: question.rubric.minWords,
            maxWords: question.rubric.maxWords,
          }
        : null,
  }));
}

function stepLink(step: Step | undefined): StepLink | null {
  if (!step) return null;
  return step.kind === 'LESSON'
    ? { kind: 'LESSON', id: step.lesson.id, title: step.lesson.title, locked: step.locked }
    : {
        kind: 'ASSESSMENT',
        id: step.assessment.id,
        title: step.assessment.title,
        locked: step.locked,
      };
}

/**
 * Taking assessments. The learner always comes from the session. Every read and
 * write checks that the attempt belongs to them (anything else is 404), and the
 * questions always come from the published version the attempt was started on.
 * Answer keys stay on the server: learner payloads are built field by field.
 */
@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly learning: LearningService,
    @Inject(WRITING_FEEDBACK_PROVIDER) private readonly feedback: WritingFeedbackProvider,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private placed(loaded: LoadedEnrollment, assessmentId: string): PlacedAssessment {
    const placed = loaded.journey.assessments.find((item) => item.assessment.id === assessmentId);
    // loadForAssessment found the assessment in this version, so it is always there.
    if (!placed) throw notFound('Assessment');
    return placed;
  }

  private place(loaded: LoadedEnrollment, placed: PlacedAssessment) {
    return {
      course: {
        id: loaded.course.id,
        slug: loaded.course.slug,
        title: loaded.snapshot.course.title,
      },
      module:
        placed.module && placed.moduleNumber !== null
          ? { id: placed.module.id, title: placed.module.title, number: placed.moduleNumber }
          : null,
    };
  }

  // ---------- The start page ----------

  async assessment(userId: string, assessmentId: string): Promise<LearnerAssessment> {
    const loaded = await this.learning.loadForAssessment(userId, assessmentId);
    const placed = this.placed(loaded, assessmentId);
    if (placed.locked) throw locked();
    const { assessment } = placed;

    const attempts = await this.db.assessmentAttempt.findMany({
      where: { userId, assessmentId },
      include: { answers: true },
      orderBy: { attemptNumber: 'desc' },
    });
    const done = attempts.filter((row) => row.status === AttemptStatus.SUBMITTED);
    const open = attempts.find((row) => row.status === AttemptStatus.IN_PROGRESS);
    const stepIndex = loaded.journey.steps.findIndex(
      (step) => step.kind === 'ASSESSMENT' && step.assessment.id === assessmentId,
    );
    return {
      ...this.place(loaded, placed),
      id: assessment.id,
      title: assessment.title,
      instructions: assessment.instructions,
      estimatedMinutes: assessment.estimatedMinutes,
      isRequired: placed.required,
      questionCount: assessment.questions.length,
      maxScore: maxScoreOf(assessment.questions),
      passPercent: assessment.passPercent,
      maxAttempts: assessment.maxAttempts,
      feedbackMode: assessment.feedbackMode,
      passed: placed.passed,
      bestPercent: done.length ? Math.max(...done.map((row) => row.percent ?? 0)) : null,
      attemptsUsed: placed.attemptsUsed,
      attemptsLeft: placed.attemptsLeft,
      openAttempt: open
        ? {
            id: open.id,
            attemptNumber: open.attemptNumber,
            answeredCount: open.answers.filter((a) => isAnswered(storedResponse(a.response)))
              .length,
          }
        : null,
      attempts: done.map(toSummary),
      previous: stepLink(loaded.journey.steps[stepIndex - 1]),
      next: stepLink(loaded.journey.steps[stepIndex + 1]),
    };
  }

  // ---------- Attempt lifecycle ----------

  /**
   * Starts an attempt, or returns the one already open (so a double click or a
   * second tab never opens two). 409 ATTEMPT_LIMIT_REACHED once every attempt is used.
   */
  async start(
    userId: string,
    assessmentId: string,
  ): Promise<{ attempt: Attempt; created: boolean }> {
    const loaded = await this.learning.loadForAssessment(userId, assessmentId);
    const placed = this.placed(loaded, assessmentId);
    if (placed.locked) throw locked();
    if (loaded.enrollment.status === EnrollmentStatus.WITHDRAWN) throw notFound('Assessment');

    const open = await this.db.assessmentAttempt.findFirst({
      where: { userId, assessmentId, status: AttemptStatus.IN_PROGRESS },
      select: { id: true },
    });
    if (open) return { attempt: await this.get(userId, open.id), created: false };
    if (placed.attemptsLeft === 0) {
      throw new AppError(
        ErrorCode.ATTEMPT_LIMIT_REACHED,
        HttpStatus.CONFLICT,
        'You have used every attempt for this quiz.',
      );
    }

    const latest = await this.db.assessmentAttempt.aggregate({
      where: { userId, assessmentId },
      _max: { attemptNumber: true },
    });
    let id: string;
    try {
      const row = await this.db.assessmentAttempt.create({
        data: {
          userId,
          enrollmentId: loaded.enrollment.id,
          courseVersionId: loaded.version.id,
          assessmentId,
          attemptNumber: (latest._max.attemptNumber ?? 0) + 1,
          maxScore: maxScoreOf(placed.assessment.questions),
        },
        select: { id: true },
      });
      id = row.id;
    } catch (error) {
      // A concurrent start won: the partial unique index allows one open attempt.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.db.assessmentAttempt.findFirst({
          where: { userId, assessmentId, status: AttemptStatus.IN_PROGRESS },
          select: { id: true },
        });
        if (winner) return { attempt: await this.get(userId, winner.id), created: false };
      }
      throw error;
    }
    await this.learning.recordActivity(loaded.enrollment.id, loaded.journey, new Date());
    return { attempt: await this.get(userId, id), created: true };
  }

  /** The learner's own attempt. Another learner's attempt is 404, never 403. */
  private async owned(userId: string, attemptId: string): Promise<AttemptRow> {
    const row = await this.db.assessmentAttempt.findFirst({
      where: { id: attemptId, userId },
      include: { answers: true },
    });
    if (!row) throw notFound();
    return row;
  }

  /** The assessment as it was in the version the attempt was started on. */
  private async pinnedAssessment(row: { courseVersionId: string; assessmentId: string }) {
    const version = await this.db.courseVersion.findUniqueOrThrow({
      where: { id: row.courseVersionId },
      select: { snapshot: true, course: { select: { id: true, slug: true } } },
    });
    const snapshot = courseSnapshotSchema.parse(version.snapshot);
    const assessment = snapshot.assessments.find((item) => item.id === row.assessmentId);
    if (!assessment) throw notFound();
    const moduleIndex = assessment.moduleId
      ? snapshot.modules.findIndex((module) => module.id === assessment.moduleId)
      : -1;
    return {
      assessment,
      course: { id: version.course.id, slug: version.course.slug, title: snapshot.course.title },
      module:
        moduleIndex >= 0
          ? {
              id: snapshot.modules[moduleIndex]!.id,
              title: snapshot.modules[moduleIndex]!.title,
              number: moduleIndex + 1,
            }
          : null,
    };
  }

  async get(userId: string, attemptId: string): Promise<Attempt> {
    const row = await this.owned(userId, attemptId);
    const pinned = await this.pinnedAssessment(row);
    const { assessment } = pinned;
    const result =
      row.status === AttemptStatus.SUBMITTED ? await this.result(row, assessment) : null;
    return {
      course: pinned.course,
      module: pinned.module,
      id: row.id,
      assessmentId: row.assessmentId,
      title: assessment.title,
      attemptNumber: row.attemptNumber,
      maxAttempts: assessment.maxAttempts,
      passPercent: assessment.passPercent,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      questions: toLearnerQuestions(assessment),
      answers: row.answers.flatMap((answer) => {
        const response = storedResponse(answer.response);
        return response ? [{ questionId: answer.questionId, response }] : [];
      }),
      result,
    };
  }

  /**
   * What the learner may see about a submitted attempt, following the feedback
   * mode. FULL reveals correct answers and explanations only once the learner has
   * passed or has no attempts left, so a retake can't be answered from the review.
   */
  private async result(row: AttemptRow, assessment: SnapshotAssessment): Promise<AttemptResult> {
    const history = await this.db.assessmentAttempt.findMany({
      where: {
        userId: row.userId,
        assessmentId: row.assessmentId,
        status: AttemptStatus.SUBMITTED,
      },
      select: { passed: true },
    });
    const exhausted = assessment.maxAttempts !== null && history.length >= assessment.maxAttempts;
    const revealed =
      assessment.feedbackMode === 'FULL' && (history.some((item) => item.passed) || exhausted);
    const answers = new Map(row.answers.map((answer) => [answer.questionId, answer]));
    return {
      score: row.score!,
      maxScore: row.maxScore,
      percent: row.percent!,
      passed: row.passed!,
      passPercent: assessment.passPercent,
      feedbackMode: assessment.feedbackMode,
      answersRevealed: revealed,
      questions:
        assessment.feedbackMode === 'SCORE_ONLY'
          ? null
          : assessment.questions.map((question) => {
              const answer = answers.get(question.id);
              return {
                questionId: question.id,
                isCorrect: question.type === 'WRITING' ? null : (answer?.isCorrect ?? false),
                awardedPoints: answer?.awardedPoints ?? 0,
                correctOptionIds:
                  revealed && question.answerKey.correctOptionIds
                    ? [...question.answerKey.correctOptionIds]
                    : null,
                acceptedAnswers:
                  revealed && question.type === 'SHORT_TEXT'
                    ? [...(question.answerKey.acceptedAnswers ?? [])]
                    : null,
                explanation: revealed && question.explanation ? question.explanation : null,
                aiFeedback: storedFeedback(answer?.feedback ?? null),
              };
            }),
    };
  }

  /** Locks the attempt row for this transaction and checks it is still open. */
  private async lockOpen(tx: Tx, userId: string, attemptId: string) {
    const [row] = await tx.$queryRaw<{ status: AttemptStatus }[]>`
      SELECT status FROM assessment_attempts
      WHERE id = ${attemptId}::uuid AND user_id = ${userId}::uuid
      FOR UPDATE`;
    if (!row) throw notFound();
    if (row.status !== AttemptStatus.IN_PROGRESS) throw submitted();
  }

  private async writeAnswer(
    tx: Tx,
    attemptId: string,
    assessment: SnapshotAssessment,
    questionId: string,
    response: AnswerResponse,
    field: string,
  ) {
    const question = assessment.questions.find((item) => item.id === questionId);
    if (!question) throw invalidAnswer(field, 'That question is not part of this quiz.');
    if (!responseFitsQuestion(question, response)) {
      throw invalidAnswer(field, "That answer doesn't fit this question.");
    }
    const json = response as unknown as Prisma.InputJsonObject;
    await tx.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: { attemptId, questionId, response: json },
      update: { response: json },
    });
  }

  /** Autosave of one answer while the attempt is open. */
  async saveAnswer(
    userId: string,
    attemptId: string,
    questionId: string,
    response: AnswerResponse,
  ): Promise<{ questionId: string; response: AnswerResponse; savedAt: string }> {
    const row = await this.owned(userId, attemptId);
    if (row.status !== AttemptStatus.IN_PROGRESS) throw submitted();
    const { assessment } = await this.pinnedAssessment(row);
    if (!assessment.questions.some((question) => question.id === questionId)) {
      throw notFound('Question');
    }
    await this.db.$transaction(async (tx) => {
      // Holding the row lock means a concurrent submit either sees this answer or rejects it.
      await this.lockOpen(tx, userId, attemptId);
      await this.writeAnswer(tx, attemptId, assessment, questionId, response, 'response');
    });
    return { questionId, response, savedAt: new Date().toISOString() };
  }

  /**
   * Submits and scores the attempt in one transaction (answers, points and the
   * result are written together, and the row lock makes a second submit fail with
   * 409). Writing feedback follows after the commit, so a slow or failing AI
   * provider never holds the transaction or loses the score.
   */
  async submit(userId: string, attemptId: string, body: SubmitAttemptRequest): Promise<Attempt> {
    const row = await this.owned(userId, attemptId);
    if (row.status !== AttemptStatus.IN_PROGRESS) throw submitted();
    const { assessment } = await this.pinnedAssessment(row);
    const now = new Date();

    await this.db.$transaction(async (tx) => {
      await this.lockOpen(tx, userId, attemptId);
      for (const [index, answer] of (body.answers ?? []).entries()) {
        await this.writeAnswer(
          tx,
          attemptId,
          assessment,
          answer.questionId,
          answer.response,
          `answers.${index}.response`,
        );
      }
      const stored = await tx.attemptAnswer.findMany({ where: { attemptId } });
      const responses = new Map<string, AnswerResponse>();
      for (const answer of stored) {
        const response = storedResponse(answer.response);
        if (response) responses.set(answer.questionId, response);
      }
      const grade = gradeAttempt(assessment.questions, responses, assessment.passPercent);
      for (const question of grade.questions) {
        if (!responses.has(question.questionId)) continue;
        await tx.attemptAnswer.update({
          where: { attemptId_questionId: { attemptId, questionId: question.questionId } },
          data: { awardedPoints: question.points, isCorrect: question.correct },
        });
      }
      await tx.assessmentAttempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.SUBMITTED,
          submittedAt: now,
          score: grade.score,
          maxScore: grade.maxScore,
          percent: grade.percent,
          passed: grade.passed,
        },
      });
    });

    await this.writeFeedback(attemptId, assessment);
    // A pass can finish the course: completion is recorded once, like lesson progress.
    const loaded = await this.learning.loadEnrollment(row.enrollmentId);
    await this.learning.recordActivity(loaded.enrollment.id, loaded.journey, new Date());
    return this.get(userId, attemptId);
  }

  /** Rubric feedback for each answered writing question, bounded and marked as AI-generated. */
  private async writeFeedback(attemptId: string, assessment: SnapshotAssessment): Promise<void> {
    const writing = assessment.questions.filter((question) => question.type === 'WRITING');
    if (!writing.length) return;
    const answers = await this.db.attemptAnswer.findMany({
      where: { attemptId, questionId: { in: writing.map((question) => question.id) } },
    });
    for (const question of writing) {
      const answer = answers.find((item) => item.questionId === question.id);
      const response = answer ? storedResponse(answer.response) : undefined;
      if (!answer || !response || !('text' in response) || !isAnswered(response)) continue;
      let feedback: AiFeedback;
      try {
        const raw = await this.feedback.evaluate(
          { prompt: question.prompt, rubric: question.rubric, answer: response.text },
          AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
        );
        feedback = boundFeedback(raw, question.rubric, this.feedback.name, new Date());
      } catch (error) {
        // Never surface provider details to the learner; the score is already saved.
        this.logger.warn(
          { attemptId, questionId: question.id, err: (error as Error).name },
          'Writing feedback failed',
        );
        feedback = unavailableFeedback(this.feedback.name, new Date());
      }
      await this.db.attemptAnswer.update({
        where: { id: answer.id },
        data: { feedback: feedback },
      });
    }
    await this.db.assessmentAttempt.update({
      where: { id: attemptId },
      data: { evaluatedAt: new Date() },
    });
  }
}
