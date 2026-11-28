import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  isChoiceType,
  isScoredType,
  QUESTION_LIMITS,
  TRUE_FALSE_OPTIONS,
  type CreateAssessmentRequest,
  type QuestionType,
  type UpdateAssessmentRequest,
  type UpdateQuestionRequest,
} from '@luminai/contracts';
import { Prisma } from '@luminai/database';
import { AppError } from '../common/app-error.js';
import { CourseAuthoringService, type Actor } from './course-authoring.service.js';
import { BY_POSITION, toSnapshotQuestion } from './course-tree.js';

type Tx = Prisma.TransactionClient;

const notFound = (what: string) =>
  new AppError(ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, `${what} not found.`);

const invalid = (field: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_FAILED, HttpStatus.UNPROCESSABLE_ENTITY, message, [
    { field, message },
  ]);

/**
 * Authoring of quizzes (assessments) and their questions. They are part of the
 * course working copy, so every change goes through `CourseAuthoringService.edit`:
 * the same ownership checks, one transaction, and a draft revision bump so the
 * change stays invisible to learners until the next publish.
 */
@Injectable()
export class AssessmentAuthoringService {
  constructor(private readonly courses: CourseAuthoringService) {}

  private async assessmentRef(tx: Tx, assessmentId: string) {
    const row = await tx.assessment.findUnique({
      where: { id: assessmentId },
      select: { courseId: true, moduleId: true },
    });
    if (!row) throw notFound('Assessment');
    return row;
  }

  private async questionRef(tx: Tx, questionId: string) {
    const row = await tx.question.findUnique({
      where: { id: questionId },
      select: { assessmentId: true, assessment: { select: { courseId: true } } },
    });
    if (!row) throw notFound('Question');
    return { assessmentId: row.assessmentId, courseId: row.assessment.courseId };
  }

  private async assertModuleOfCourse(tx: Tx, moduleId: string | null, courseId: string) {
    if (moduleId === null) return;
    const module = await tx.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module || module.courseId !== courseId) {
      throw invalid('moduleId', 'Choose a module of the same course.');
    }
  }

  private async nextPosition(tx: Tx, courseId: string, moduleId: string | null) {
    const last = await tx.assessment.aggregate({
      where: { courseId, moduleId },
      _max: { position: true },
    });
    return (last._max.position ?? -1) + 1;
  }

  private async renumberAssessments(tx: Tx, courseId: string, moduleId: string | null) {
    const rows = await tx.assessment.findMany({
      where: { courseId, moduleId },
      orderBy: [...BY_POSITION],
      select: { id: true },
    });
    for (const [position, row] of rows.entries()) {
      await tx.assessment.update({ where: { id: row.id }, data: { position } });
    }
  }

  private async renumberQuestions(tx: Tx, assessmentId: string, ids?: string[]) {
    const order =
      ids ??
      (
        await tx.question.findMany({
          where: { assessmentId },
          orderBy: [...BY_POSITION],
          select: { id: true },
        })
      ).map((row) => row.id);
    for (const [position, id] of order.entries()) {
      await tx.question.update({ where: { id }, data: { position } });
    }
  }

  // ---------- Assessments ----------

  createAssessment(actor: Actor, courseId: string, input: CreateAssessmentRequest) {
    return this.courses.edit(
      actor,
      () => Promise.resolve(courseId),
      async (tx, id) => {
        await this.assertModuleOfCourse(tx, input.moduleId, id);
        await tx.assessment.create({
          data: {
            courseId: id,
            moduleId: input.moduleId,
            title: input.title,
            position: await this.nextPosition(tx, id, input.moduleId),
          },
        });
      },
    );
  }

  updateAssessment(actor: Actor, assessmentId: string, input: UpdateAssessmentRequest) {
    return this.courses.edit(
      actor,
      async (tx) => (await this.assessmentRef(tx, assessmentId)).courseId,
      async (tx, courseId) => {
        const { moduleId, ...fields } = input;
        const data: Prisma.AssessmentUncheckedUpdateInput = { ...fields };
        const ref = await this.assessmentRef(tx, assessmentId);
        const moving = moduleId !== undefined && moduleId !== ref.moduleId;
        if (moving) {
          await this.assertModuleOfCourse(tx, moduleId, courseId);
          data.moduleId = moduleId;
          data.position = await this.nextPosition(tx, courseId, moduleId);
        }
        await tx.assessment.update({ where: { id: assessmentId }, data });
        if (moving) await this.renumberAssessments(tx, courseId, ref.moduleId);
      },
    );
  }

  deleteAssessment(actor: Actor, assessmentId: string) {
    return this.courses.edit(
      actor,
      async (tx) => (await this.assessmentRef(tx, assessmentId)).courseId,
      async (tx, courseId) => {
        const ref = await this.assessmentRef(tx, assessmentId);
        await tx.assessment.delete({ where: { id: assessmentId } });
        await this.renumberAssessments(tx, courseId, ref.moduleId);
      },
    );
  }

  // ---------- Questions ----------

  createQuestion(actor: Actor, assessmentId: string, input: { type: QuestionType }) {
    return this.courses.edit(
      actor,
      async (tx) => (await this.assessmentRef(tx, assessmentId)).courseId,
      async (tx) => {
        const count = await tx.question.count({ where: { assessmentId } });
        if (count >= QUESTION_LIMITS.questionsPerAssessment) {
          throw invalid(
            'type',
            `A quiz can have at most ${QUESTION_LIMITS.questionsPerAssessment} questions.`,
          );
        }
        await tx.question.create({
          data: {
            assessmentId,
            type: input.type,
            options: input.type === 'TRUE_FALSE' ? [...TRUE_FALSE_OPTIONS] : [],
            points: isScoredType(input.type) ? 1 : 0,
            position: count,
          },
        });
      },
    );
  }

  updateQuestion(actor: Actor, questionId: string, input: UpdateQuestionRequest) {
    return this.courses.edit(
      actor,
      async (tx) => (await this.questionRef(tx, questionId)).courseId,
      async (tx) => {
        const row = await tx.question.findUniqueOrThrow({ where: { id: questionId } });
        const current = toSnapshotQuestion(row);
        const type = input.type ?? current.type;
        // Keep the stored question consistent with its type, whatever the editor sends.
        const options = !isChoiceType(type)
          ? []
          : type === 'TRUE_FALSE'
            ? [...TRUE_FALSE_OPTIONS]
            : (input.options ?? current.options);
        const optionIds = new Set(options.map((option) => option.id));
        const key = input.answerKey ?? current.answerKey;
        const answerKey: Prisma.InputJsonObject = isChoiceType(type)
          ? { correctOptionIds: (key.correctOptionIds ?? []).filter((id) => optionIds.has(id)) }
          : type === 'SHORT_TEXT'
            ? { acceptedAnswers: key.acceptedAnswers ?? [] }
            : {};
        const points = isScoredType(type) ? Math.max(1, input.points ?? current.points) : 0;
        await tx.question.update({
          where: { id: questionId },
          data: {
            type,
            prompt: input.prompt ?? current.prompt,
            options: options,
            answerKey,
            explanation: input.explanation ?? current.explanation,
            rubric:
              type === 'WRITING'
                ? (input.rubric ?? current.rubric)
                : { criteria: [], minWords: null, maxWords: null },
            points,
          },
        });
      },
    );
  }

  deleteQuestion(actor: Actor, questionId: string) {
    return this.courses.edit(
      actor,
      async (tx) => (await this.questionRef(tx, questionId)).courseId,
      async (tx) => {
        const { assessmentId } = await this.questionRef(tx, questionId);
        await tx.question.delete({ where: { id: questionId } });
        await this.renumberQuestions(tx, assessmentId);
      },
    );
  }

  reorderQuestions(actor: Actor, assessmentId: string, ids: string[]) {
    return this.courses.edit(
      actor,
      async (tx) => (await this.assessmentRef(tx, assessmentId)).courseId,
      async (tx) => {
        const rows = await tx.question.findMany({ where: { assessmentId }, select: { id: true } });
        const known = new Set(rows.map((row) => row.id));
        if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
          throw invalid('ids', 'List every question exactly once.');
        }
        await this.renumberQuestions(tx, assessmentId, ids);
      },
    );
  }
}
