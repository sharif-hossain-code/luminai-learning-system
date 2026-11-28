/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any --
   assertions read loosely typed JSON bodies; responses that matter are parsed with the contract schemas. */
import {
  adminCourseSchema,
  attemptSchema,
  errorEnvelopeSchema,
  learnerAssessmentSchema,
  learnerCourseSchema,
  type AdminCourse,
  type QuestionType,
} from '@luminai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeAdmin, signedInLearner, startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let admin: { cookie: string; userId: string };
let categoryId: string;

beforeAll(async () => {
  t = await startTestApp();
  admin = await signedInLearner(t, 'quiz-admin');
  await makeAdmin(t.db, admin.userId);
  categoryId = (await t.db.category.findUniqueOrThrow({ where: { slug: 'communication' } })).id;
});

afterAll(async () => {
  await t?.close();
});

const errorOf = (response: { json: () => unknown }) =>
  errorEnvelopeSchema.parse(response.json()).error;
const dataOf = (response: { json: () => unknown }): any =>
  (response.json() as { data: unknown }).data;
function ok(response: { statusCode: number; body: string; json: () => unknown }): any {
  if (response.statusCode >= 300) throw new Error(`${response.statusCode}: ${response.body}`);
  return dataOf(response);
}

/** Answer-key text that must never reach a learner before the review allows it. */
const SECRET_ANSWER = 'tricolon-secret-answer';
const SECRET_EXPLANATION = 'Explanation-only-after-review';

interface QuestionSpec {
  type: QuestionType;
  points?: number;
}

const STANDARD_QUIZ: QuestionSpec[] = [
  { type: 'SINGLE_CHOICE', points: 2 },
  { type: 'MULTIPLE_CHOICE' },
  { type: 'TRUE_FALSE' },
  { type: 'SHORT_TEXT' },
  { type: 'WRITING' },
];

/** The body that makes a question complete, with a known answer key. */
function questionBody(spec: QuestionSpec) {
  const base = { prompt: `A ${spec.type} question`, explanation: SECRET_EXPLANATION };
  switch (spec.type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
      return {
        ...base,
        points: spec.points ?? 1,
        options: [
          { id: 'a', text: 'Option A' },
          { id: 'b', text: 'Option B' },
          { id: 'c', text: 'Option C' },
        ],
        answerKey: { correctOptionIds: spec.type === 'SINGLE_CHOICE' ? ['b'] : ['a', 'c'] },
      };
    case 'TRUE_FALSE':
      return { ...base, points: spec.points ?? 1, answerKey: { correctOptionIds: ['false'] } };
    case 'SHORT_TEXT':
      return { ...base, points: spec.points ?? 1, answerKey: { acceptedAnswers: [SECRET_ANSWER] } };
    case 'WRITING':
      return {
        ...base,
        rubric: {
          criteria: [
            { id: 'hook', label: 'Hooks attention', description: 'Opens with a surprising fact.' },
            { id: 'plain', label: 'States the news plainly', description: '' },
          ],
          minWords: 3,
          maxWords: 80,
        },
      };
  }
}

/** Right answers for STANDARD_QUIZ, in question order. */
const RIGHT = [
  { optionIds: ['b'] },
  { optionIds: ['c', 'a'] },
  { optionIds: ['false'] },
  { text: ` ${SECRET_ANSWER.toUpperCase()}! ` },
  { text: 'A surprising fact: our project is three weeks late.' },
];

let counter = 0;

interface CourseSpec {
  /** Quizzes per module (index), with their questions. */
  moduleQuizzes?: Record<
    number,
    { questions?: QuestionSpec[]; settings?: Record<string, unknown> }
  >;
  finalQuiz?: { questions?: QuestionSpec[]; settings?: Record<string, unknown> };
  modules?: number;
}

/** Builds and publishes a course with one lesson per module plus the quizzes asked for. */
async function publishedCourse(spec: CourseSpec = {}) {
  counter += 1;
  const slug = `quiz-course-${Date.now().toString(36)}-${counter}`;
  const cookie = admin.cookie;
  let course: AdminCourse = adminCourseSchema.parse(
    ok(
      await call(t.app, 'POST', '/admin/courses', {
        cookie,
        body: { title: 'Presenting with confidence', categoryId, slug },
      }),
    ),
  );
  ok(
    await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
      cookie,
      body: {
        summary: 'Present well.',
        description: 'A short course.',
        estimatedMinutes: 60,
        outcomes: ['Open a talk'],
      },
    }),
  );
  const lessons: string[] = [];
  for (let m = 0; m < (spec.modules ?? 2); m += 1) {
    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/courses/${course.id}/modules`, {
          cookie,
          body: { title: `Module ${m + 1}` },
        }),
      ),
    );
    const moduleId = course.modules[m]!.id;
    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/modules/${moduleId}/lessons`, {
          cookie,
          body: { title: `Lesson ${m + 1}`, type: 'TEXT' },
        }),
      ),
    );
    const lessonId = course.modules[m]!.lessons[0]!.id;
    lessons.push(lessonId);
    ok(
      await call(t.app, 'PATCH', `/admin/lessons/${lessonId}`, {
        cookie,
        body: {
          estimatedMinutes: 5,
          content: { schemaVersion: 1, blocks: [{ type: 'paragraph', content: [{ text: 'Hi' }] }] },
        },
      }),
    );
  }

  const quizzes: Record<string, { id: string; questionIds: string[] }> = {};
  const addQuiz = async (
    key: string,
    moduleId: string | null,
    quizSpec: { questions?: QuestionSpec[]; settings?: Record<string, unknown> },
  ) => {
    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/courses/${course.id}/assessments`, {
          cookie,
          body: { title: `Quiz ${key}`, moduleId },
        }),
      ),
    );
    const assessment = course.assessments.find((a) => a.title === `Quiz ${key}`)!;
    if (quizSpec.settings) {
      ok(
        await call(t.app, 'PATCH', `/admin/assessments/${assessment.id}`, {
          cookie,
          body: quizSpec.settings,
        }),
      );
    }
    const questionIds: string[] = [];
    for (const [index, question] of (quizSpec.questions ?? STANDARD_QUIZ).entries()) {
      course = adminCourseSchema.parse(
        ok(
          await call(t.app, 'POST', `/admin/assessments/${assessment.id}/questions`, {
            cookie,
            body: { type: question.type },
          }),
        ),
      );
      const id = course.assessments.find((a) => a.id === assessment.id)!.questions[index]!.id;
      questionIds.push(id);
      ok(
        await call(t.app, 'PATCH', `/admin/questions/${id}`, {
          cookie,
          body: questionBody(question),
        }),
      );
    }
    quizzes[key] = { id: assessment.id, questionIds };
  };
  for (const [index, quizSpec] of Object.entries(spec.moduleQuizzes ?? {})) {
    await addQuiz(`m${index}`, course.modules[Number(index)]!.id, quizSpec);
  }
  if (spec.finalQuiz) await addQuiz('final', null, spec.finalQuiz);

  ok(await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie }));
  return { id: course.id, slug, lessons, quizzes };
}

const enrol = async (who: { cookie: string }, courseId: string) =>
  ok(await call(t.app, 'POST', `/courses/${courseId}/enrollments`, { cookie: who.cookie }));
const completeLesson = async (who: { cookie: string }, lessonId: string) =>
  ok(
    await call(t.app, 'PUT', `/lessons/${lessonId}/progress`, {
      cookie: who.cookie,
      body: { completed: true },
    }),
  );
const start = (who: { cookie: string }, assessmentId: string) =>
  call(t.app, 'POST', `/assessments/${assessmentId}/attempts`, { cookie: who.cookie });
const save = (who: { cookie: string }, attemptId: string, questionId: string, response: unknown) =>
  call(t.app, 'PUT', `/attempts/${attemptId}/answers/${questionId}`, {
    cookie: who.cookie,
    body: { response },
  });
const submit = (who: { cookie: string }, attemptId: string, body: unknown = {}) =>
  call(t.app, 'POST', `/attempts/${attemptId}/submit`, { cookie: who.cookie, body });

/** A learner enrolled in a course with module 1's lesson done, ready for its quiz. */
async function readyLearner(course: Awaited<ReturnType<typeof publishedCourse>>, label: string) {
  const learner = await signedInLearner(t, label);
  await enrol(learner, course.id);
  await completeLesson(learner, course.lessons[0]!);
  return learner;
}

describe('quiz authoring', () => {
  it('lists what stops a quiz from being published, and links to it', async () => {
    const created = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', '/admin/courses', {
          cookie: admin.cookie,
          body: { title: 'Draft with a quiz', categoryId },
        }),
      ),
    );
    let course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/courses/${created.id}/assessments`, {
          cookie: admin.cookie,
          body: { title: 'Final check', moduleId: null },
        }),
      ),
    );
    const quiz = course.assessments[0]!;
    expect(quiz).toMatchObject({
      moduleId: null,
      isRequired: true,
      passPercent: 70,
      questions: [],
    });
    expect(course.publishIssues).toContainEqual({
      path: `assessment:${quiz.id}`,
      message: 'Final check: Add at least one question.',
    });

    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/assessments/${quiz.id}/questions`, {
          cookie: admin.cookie,
          body: { type: 'SINGLE_CHOICE' },
        }),
      ),
    );
    const questionId = course.assessments[0]!.questions[0]!.id;
    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'PATCH', `/admin/questions/${questionId}`, {
          cookie: admin.cookie,
          body: { prompt: 'Pick one', options: [{ id: 'a', text: 'Only option' }] },
        }),
      ),
    );
    expect(course.publishIssues.find((i) => i.path === `assessment:${quiz.id}`)?.message).toBe(
      'Final check: Question 1: add at least two options, mark the correct answer.',
    );
  });

  it('keeps questions consistent with their type', async () => {
    const created = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', '/admin/courses', {
          cookie: admin.cookie,
          body: { title: 'Type changes', categoryId },
        }),
      ),
    );
    let course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/courses/${created.id}/assessments`, {
          cookie: admin.cookie,
          body: { title: 'Quiz', moduleId: null },
        }),
      ),
    );
    const quizId = course.assessments[0]!.id;
    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/assessments/${quizId}/questions`, {
          cookie: admin.cookie,
          body: { type: 'TRUE_FALSE' },
        }),
      ),
    );
    const question = course.assessments[0]!.questions[0]!;
    expect(question.options.map((o) => o.id)).toEqual(['true', 'false']);

    // Correct ids that aren't options are dropped; writing questions are never scored.
    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'PATCH', `/admin/questions/${question.id}`, {
          cookie: admin.cookie,
          body: { answerKey: { correctOptionIds: ['true', 'nope'] } },
        }),
      ),
    );
    expect(course.assessments[0]!.questions[0]!.answerKey.correctOptionIds).toEqual(['true']);
    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'PATCH', `/admin/questions/${question.id}`, {
          cookie: admin.cookie,
          body: { type: 'WRITING', points: 5 },
        }),
      ),
    );
    expect(course.assessments[0]!.questions[0]).toMatchObject({
      type: 'WRITING',
      points: 0,
      options: [],
      answerKey: {},
    });
  });

  it('rejects learners and other editors on every quiz authoring route', async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {} } });
    const learner = await signedInLearner(t, 'quiz-intruder');
    const quiz = course.quizzes.m0!;
    const routes = [
      ['POST', `/admin/courses/${course.id}/assessments`, { title: 'X', moduleId: null }],
      ['PATCH', `/admin/assessments/${quiz.id}`, { title: 'X' }],
      ['DELETE', `/admin/assessments/${quiz.id}`, undefined],
      ['POST', `/admin/assessments/${quiz.id}/questions`, { type: 'SHORT_TEXT' }],
      ['PATCH', `/admin/questions/${quiz.questionIds[0]}`, { prompt: 'X' }],
      ['DELETE', `/admin/questions/${quiz.questionIds[0]}`, undefined],
    ] as const;
    for (const [method, path, body] of routes) {
      const response = await call(t.app, method, path, {
        cookie: learner.cookie,
        ...(body ? { body } : {}),
      });
      expect(response.statusCode, `${method} ${path}`).toBe(403);
    }

    const editor = await signedInLearner(t, 'other-editor');
    const role = await t.db.role.findUniqueOrThrow({ where: { code: 'CONTENT_EDITOR' } });
    await t.db.user.update({ where: { id: editor.userId }, data: { roleId: role.id } });
    const response = await call(t.app, 'PATCH', `/admin/assessments/${quiz.id}`, {
      cookie: editor.cookie,
      body: { title: 'Not mine' },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('answer keys', () => {
  it('never appear in learner responses before the review allows them', async () => {
    const course = await publishedCourse({
      moduleQuizzes: { 0: { settings: { feedbackMode: 'FULL', passPercent: 100 } } },
    });
    const learner = await readyLearner(course, 'key-leak');
    const quiz = course.quizzes.m0!;
    const bodies: string[] = [];
    const record = (response: { body: string }) => {
      bodies.push(response.body);
      return response;
    };

    record(await call(t.app, 'GET', `/catalog/courses/${course.slug}`));
    record(await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: learner.cookie }));
    const intro = record(
      await call(t.app, 'GET', `/assessments/${quiz.id}`, { cookie: learner.cookie }),
    );
    learnerAssessmentSchema.parse(ok(intro));
    const started = record(await start(learner, quiz.id));
    expect(started.statusCode).toBe(201);
    const attempt = attemptSchema.parse(ok(started));
    record(await save(learner, attempt.id, quiz.questionIds[0]!, { optionIds: ['a'] }));
    record(await call(t.app, 'GET', `/attempts/${attempt.id}`, { cookie: learner.cookie }));
    // Submitted, not passed, attempts left: right and wrong are shown, answers are not.
    const result = attemptSchema.parse(ok(record(await submit(learner, attempt.id))));
    expect(result.result).toMatchObject({ passed: false, answersRevealed: false });
    record(await call(t.app, 'GET', `/users/me/up-next`, { cookie: learner.cookie }));

    for (const body of bodies) {
      expect(body).not.toContain(SECRET_ANSWER);
      expect(body).not.toContain(SECRET_EXPLANATION);
      expect(body).not.toContain('answerKey');
      expect(body).not.toMatch(/"correctOptionIds":\[/);
      expect(body).not.toMatch(/"acceptedAnswers":\[/);
    }
    // Learner questions carry options and rubrics, nothing else.
    expect(Object.keys(attempt.questions[0]!).sort()).toEqual(
      ['id', 'number', 'options', 'points', 'prompt', 'rubric', 'type'].sort(),
    );
  });

  it('reveals answers and explanations once the learner passes (FULL feedback)', async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {} } });
    const learner = await readyLearner(course, 'key-reveal');
    const quiz = course.quizzes.m0!;
    const attempt = attemptSchema.parse(ok(await start(learner, quiz.id)));
    const answers = quiz.questionIds.map((questionId, i) => ({ questionId, response: RIGHT[i] }));
    const result = attemptSchema.parse(ok(await submit(learner, attempt.id, { answers })));
    expect(result.result).toMatchObject({ passed: true, answersRevealed: true });
    const short = result.result!.questions!.find((q) => q.questionId === quiz.questionIds[3]);
    expect(short).toMatchObject({
      acceptedAnswers: [SECRET_ANSWER],
      explanation: SECRET_EXPLANATION,
    });
  });

  it('shows only the score in SCORE_ONLY mode', async () => {
    const course = await publishedCourse({
      moduleQuizzes: { 0: { settings: { feedbackMode: 'SCORE_ONLY' } } },
    });
    const learner = await readyLearner(course, 'score-only');
    const quiz = course.quizzes.m0!;
    const attempt = attemptSchema.parse(ok(await start(learner, quiz.id)));
    const answers = quiz.questionIds.map((questionId, i) => ({ questionId, response: RIGHT[i] }));
    const response = await submit(learner, attempt.id, { answers });
    expect(attemptSchema.parse(ok(response)).result).toMatchObject({
      passed: true,
      questions: null,
    });
    expect(response.body).not.toContain(SECRET_ANSWER);
  });
});

describe('attempt ownership', () => {
  it("returns 404 for someone else's attempt on every attempt route", async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {} } });
    const owner = await readyLearner(course, 'attempt-owner');
    const other = await readyLearner(course, 'attempt-other');
    const quiz = course.quizzes.m0!;
    const attempt = attemptSchema.parse(ok(await start(owner, quiz.id)));

    const responses = [
      await call(t.app, 'GET', `/attempts/${attempt.id}`, { cookie: other.cookie }),
      await save(other, attempt.id, quiz.questionIds[0]!, { optionIds: ['b'] }),
      await submit(other, attempt.id),
    ];
    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(errorOf(response).code).toBe('RESOURCE_NOT_FOUND');
    }
    expect(await t.db.attemptAnswer.count({ where: { attemptId: attempt.id } })).toBe(0);
    expect((await call(t.app, 'GET', `/attempts/${attempt.id}`)).statusCode).toBe(401);
  });

  it('refuses learners who are not enrolled, and locked quizzes', async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {}, 1: {} } });
    const outsider = await signedInLearner(t, 'quiz-outsider');
    const notEnrolled = await call(t.app, 'GET', `/assessments/${course.quizzes.m0!.id}`, {
      cookie: outsider.cookie,
    });
    expect(notEnrolled.statusCode).toBe(403);
    expect(errorOf(notEnrolled).code).toBe('NOT_ENROLLED');
    expect((await start(outsider, course.quizzes.m0!.id)).statusCode).toBe(403);

    const learner = await readyLearner(course, 'quiz-locked');
    // Module 2's quiz stays locked until module 1 (its lessons and its quiz) is done.
    const lockedRead = await call(t.app, 'GET', `/assessments/${course.quizzes.m1!.id}`, {
      cookie: learner.cookie,
    });
    expect(lockedRead.statusCode).toBe(403);
    expect(errorOf(lockedRead).code).toBe('ASSESSMENT_LOCKED');
    expect(errorOf(await start(learner, course.quizzes.m1!.id)).code).toBe('ASSESSMENT_LOCKED');

    const unknown = await call(t.app, 'GET', `/assessments/${crypto.randomUUID()}`, {
      cookie: learner.cookie,
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('attempt lifecycle', () => {
  it('opens one attempt at a time, even under concurrent starts', async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {} } });
    const learner = await readyLearner(course, 'start-race');
    const quiz = course.quizzes.m0!;
    const responses = await Promise.all(Array.from({ length: 5 }, () => start(learner, quiz.id)));
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => dataOf(r).id)).size).toBe(1);
    expect(
      await t.db.assessmentAttempt.count({
        where: { userId: learner.userId, assessmentId: quiz.id },
      }),
    ).toBe(1);
  });

  it('autosaves answers, then refuses any change once submitted', async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {} } });
    const learner = await readyLearner(course, 'lifecycle');
    const quiz = course.quizzes.m0!;
    const attempt = attemptSchema.parse(ok(await start(learner, quiz.id)));
    expect(attempt).toMatchObject({ status: 'IN_PROGRESS', attemptNumber: 1, result: null });

    ok(await save(learner, attempt.id, quiz.questionIds[0]!, { optionIds: ['a'] }));
    ok(await save(learner, attempt.id, quiz.questionIds[0]!, { optionIds: ['b'] }));
    const reread = attemptSchema.parse(
      ok(await call(t.app, 'GET', `/attempts/${attempt.id}`, { cookie: learner.cookie })),
    );
    expect(reread.answers).toEqual([
      { questionId: quiz.questionIds[0], response: { optionIds: ['b'] } },
    ]);

    // Answers that don't fit the question are refused.
    const wrongShape = await save(learner, attempt.id, quiz.questionIds[0]!, { text: 'b' });
    expect(wrongShape.statusCode).toBe(422);
    const twoForSingle = await save(learner, attempt.id, quiz.questionIds[0]!, {
      optionIds: ['a', 'b'],
    });
    expect(twoForSingle.statusCode).toBe(422);
    expect((await save(learner, attempt.id, crypto.randomUUID(), { text: 'x' })).statusCode).toBe(
      404,
    );

    const submitted = attemptSchema.parse(ok(await submit(learner, attempt.id)));
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.result).toMatchObject({ score: 2, maxScore: 5, percent: 40, passed: false });

    const late = await save(learner, attempt.id, quiz.questionIds[1]!, { optionIds: ['a'] });
    expect(late.statusCode).toBe(409);
    expect(errorOf(late).code).toBe('ATTEMPT_SUBMITTED');
    const again = await submit(learner, attempt.id, {
      answers: [{ questionId: quiz.questionIds[1], response: { optionIds: ['a', 'c'] } }],
    });
    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe('ATTEMPT_SUBMITTED');

    const row = await t.db.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(row).toMatchObject({ status: 'SUBMITTED', score: 2, percent: 40, passed: false });
    expect(await t.db.attemptAnswer.count({ where: { attemptId: attempt.id } })).toBe(1);
  });

  it('lets exactly one of two concurrent submits through', async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {} } });
    const learner = await readyLearner(course, 'submit-race');
    const attempt = attemptSchema.parse(ok(await start(learner, course.quizzes.m0!.id)));
    const responses = await Promise.all([submit(learner, attempt.id), submit(learner, attempt.id)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it('scores every question type and marks writing feedback as AI-generated', async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {} } });
    const learner = await readyLearner(course, 'scoring');
    const quiz = course.quizzes.m0!;
    const attempt = attemptSchema.parse(ok(await start(learner, quiz.id)));
    const wrongMulti = { optionIds: ['a'] };
    const answers = quiz.questionIds.map((questionId, i) => ({
      questionId,
      response: i === 1 ? wrongMulti : RIGHT[i],
    }));
    const result = attemptSchema.parse(ok(await submit(learner, attempt.id, { answers }))).result!;
    expect(result).toMatchObject({ score: 4, maxScore: 5, percent: 80, passed: true });
    expect(result.questions!.map((q) => [q.isCorrect, q.awardedPoints])).toEqual([
      [true, 2],
      [false, 0],
      [true, 1],
      [true, 1],
      [null, 0],
    ]);
    const feedback = result.questions![4]!.aiFeedback!;
    expect(feedback).toMatchObject({ generatedBy: 'AI', status: 'READY', provider: 'mock' });
    expect(feedback.notice).toMatch(/AI-generated/);
    expect(feedback.criteria.map((c) => c.criterionId)).toEqual(['hook', 'plain']);
    expect(feedback.criteria.every((c) => ['MET', 'PARTLY', 'NOT_YET'].includes(c.rating))).toBe(
      true,
    );
    expect(
      (await t.db.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).evaluatedAt,
    ).not.toBeNull();
  });

  it('stops new attempts once the limit is used, then reveals the answers', async () => {
    const course = await publishedCourse({
      moduleQuizzes: { 0: { settings: { maxAttempts: 1 } } },
    });
    const learner = await readyLearner(course, 'limit');
    const quiz = course.quizzes.m0!;
    const attempt = attemptSchema.parse(ok(await start(learner, quiz.id)));
    const result = attemptSchema.parse(ok(await submit(learner, attempt.id))).result!;
    expect(result).toMatchObject({ passed: false, answersRevealed: true });

    const blocked = await start(learner, quiz.id);
    expect(blocked.statusCode).toBe(409);
    expect(errorOf(blocked).code).toBe('ATTEMPT_LIMIT_REACHED');
    const intro = learnerAssessmentSchema.parse(
      ok(await call(t.app, 'GET', `/assessments/${quiz.id}`, { cookie: learner.cookie })),
    );
    expect(intro).toMatchObject({
      attemptsUsed: 1,
      attemptsLeft: 0,
      passed: false,
      bestPercent: 0,
    });
    const view = learnerCourseSchema.parse(
      ok(await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: learner.cookie })),
    );
    expect(view.modules[0]!.assessments[0]).toMatchObject({ outOfAttempts: true });
  });

  it('keeps an open attempt on the version it started with after a republish', async () => {
    const course = await publishedCourse({ moduleQuizzes: { 0: {} } });
    const learner = await readyLearner(course, 'republish');
    const quiz = course.quizzes.m0!;
    const attempt = attemptSchema.parse(ok(await start(learner, quiz.id)));

    // The editor changes the right answer to question 1 and republishes.
    ok(
      await call(t.app, 'PATCH', `/admin/questions/${quiz.questionIds[0]}`, {
        cookie: admin.cookie,
        body: { answerKey: { correctOptionIds: ['c'] }, prompt: 'Changed prompt' },
      }),
    );
    ok(await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }));

    const reread = attemptSchema.parse(
      ok(await call(t.app, 'GET', `/attempts/${attempt.id}`, { cookie: learner.cookie })),
    );
    expect(reread.questions[0]!.prompt).toBe('A SINGLE_CHOICE question');
    const result = attemptSchema.parse(
      ok(
        await submit(learner, attempt.id, {
          answers: [{ questionId: quiz.questionIds[0], response: { optionIds: ['b'] } }],
        }),
      ),
    ).result!;
    // Scored against the version the attempt started on.
    expect(result.questions![0]).toMatchObject({ isCorrect: true, awardedPoints: 2 });

    const next = attemptSchema.parse(ok(await start(learner, quiz.id)));
    expect(next.questions[0]!.prompt).toBe('Changed prompt');
  });
});

describe('course completion with assessments', () => {
  it('completes the course only once the required quizzes are passed', async () => {
    const course = await publishedCourse({
      modules: 1,
      moduleQuizzes: { 0: {} },
      finalQuiz: { questions: [{ type: 'TRUE_FALSE' }] },
    });
    const learner = await readyLearner(course, 'completion');
    let view = learnerCourseSchema.parse(
      ok(await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: learner.cookie })),
    );
    expect(view.enrollment.status).toBe('ACTIVE');
    expect(view.progress).toMatchObject({
      completedLessons: 1,
      requiredLessons: 1,
      passedAssessments: 0,
      requiredAssessments: 2,
      percent: 33,
    });
    expect(view.nextLesson).toMatchObject({ kind: 'ASSESSMENT', id: course.quizzes.m0!.id });
    expect(view.finalAssessments[0]).toMatchObject({ locked: true });

    const upNext = ok(await call(t.app, 'GET', '/users/me/up-next', { cookie: learner.cookie }));
    expect(upNext.map((item: { id: string }) => item.id)).toEqual([course.quizzes.m0!.id]);

    // Pass the module quiz: the final assessment opens.
    const first = attemptSchema.parse(ok(await start(learner, course.quizzes.m0!.id)));
    const answers = course.quizzes.m0!.questionIds.map((questionId, i) => ({
      questionId,
      response: RIGHT[i],
    }));
    ok(await submit(learner, first.id, { answers }));
    view = learnerCourseSchema.parse(
      ok(await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: learner.cookie })),
    );
    expect(view.enrollment.status).toBe('ACTIVE');
    expect(view.finalAssessments[0]).toMatchObject({ locked: false, state: 'NOT_STARTED' });

    // Fail the final once: still not complete.
    const finalId = course.quizzes.final!.id;
    const failed = attemptSchema.parse(ok(await start(learner, finalId)));
    ok(
      await submit(learner, failed.id, {
        answers: [
          { questionId: course.quizzes.final!.questionIds[0], response: { optionIds: ['true'] } },
        ],
      }),
    );
    view = learnerCourseSchema.parse(
      ok(await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: learner.cookie })),
    );
    expect(view.enrollment.status).toBe('ACTIVE');

    // Pass it: the course completes.
    const passed = attemptSchema.parse(ok(await start(learner, finalId)));
    expect(passed.attemptNumber).toBe(2);
    ok(
      await submit(learner, passed.id, {
        answers: [
          { questionId: course.quizzes.final!.questionIds[0], response: { optionIds: ['false'] } },
        ],
      }),
    );
    view = learnerCourseSchema.parse(
      ok(await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: learner.cookie })),
    );
    expect(view.enrollment.status).toBe('COMPLETED');
    expect(view.progress.percent).toBe(100);
    expect(ok(await call(t.app, 'GET', '/users/me/up-next', { cookie: learner.cookie }))).toEqual(
      [],
    );
  });
});
