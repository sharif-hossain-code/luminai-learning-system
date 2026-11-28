/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any --
   assertions read loosely typed JSON bodies; responses that matter are parsed with the contract schemas. */
import {
  adminCourseSchema,
  enrolledCourseSchema,
  enrollmentSchema,
  errorEnvelopeSchema,
  learnerCourseSchema,
  learnerLessonSchema,
  lessonProgressResultSchema,
  type AdminCourse,
} from '@luminai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  makeAdmin,
  sessionCookieFrom,
  signedInLearner,
  startTestApp,
  STRONG_PASSWORD,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let admin: { cookie: string; userId: string };
let categoryId: string;

beforeAll(async () => {
  t = await startTestApp();
  admin = await signedInLearner(t, 'learning-admin');
  await makeAdmin(t.db, admin.userId);
  categoryId = (await t.db.category.findUniqueOrThrow({ where: { slug: 'leadership' } })).id;
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

interface LessonSpec {
  type?: 'TEXT' | 'VIDEO';
  rule?: 'MARK_COMPLETE' | 'VIEW' | 'MEDIA_FINISHED';
  required?: boolean;
  minutes?: number;
}
interface ModuleSpec {
  required?: boolean;
  lessons: LessonSpec[];
}

let counter = 0;

/** Builds and publishes a course as the admin. Returns lesson ids per module. */
async function publishedCourse(modules: ModuleSpec[]) {
  counter += 1;
  const slug = `journey-${Date.now().toString(36)}-${counter}`;
  const cookie = admin.cookie;
  let course: AdminCourse = adminCourseSchema.parse(
    ok(
      await call(t.app, 'POST', '/admin/courses', {
        cookie,
        body: { title: 'Leading a team', categoryId, slug },
      }),
    ),
  );
  ok(
    await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
      cookie,
      body: {
        summary: 'Lead a small team well.',
        description: 'A short course.',
        estimatedMinutes: 120,
        outcomes: ['Run a one-to-one'],
      },
    }),
  );
  const ids: string[][] = [];
  for (const [m, moduleSpec] of modules.entries()) {
    course = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/courses/${course.id}/modules`, {
          cookie,
          body: { title: `Module ${m + 1}` },
        }),
      ),
    );
    const moduleId = course.modules[m]!.id;
    if (moduleSpec.required === false) {
      ok(
        await call(t.app, 'PATCH', `/admin/modules/${moduleId}`, {
          cookie,
          body: { isRequired: false },
        }),
      );
    }
    ids.push([]);
    for (const [l, spec] of moduleSpec.lessons.entries()) {
      course = adminCourseSchema.parse(
        ok(
          await call(t.app, 'POST', `/admin/modules/${moduleId}/lessons`, {
            cookie,
            body: { title: `Lesson ${m + 1}.${l + 1}`, type: spec.type ?? 'TEXT' },
          }),
        ),
      );
      const lessonId = course.modules[m]!.lessons[l]!.id;
      ids[m]!.push(lessonId);
      ok(
        await call(t.app, 'PATCH', `/admin/lessons/${lessonId}`, {
          cookie,
          body: {
            estimatedMinutes: spec.minutes ?? 5,
            completionRule: spec.rule ?? 'MARK_COMPLETE',
            isRequired: spec.required ?? true,
            content: {
              schemaVersion: 1,
              blocks: [{ type: 'paragraph', content: [{ text: `Text of ${m + 1}.${l + 1}` }] }],
            },
          },
        }),
      );
      if (spec.type === 'VIDEO') {
        for (const [type, url] of [
          ['VIDEO', 'https://media.example.com/talk.mp4'],
          ['CAPTIONS', 'https://media.example.com/talk.vtt'],
        ] as const) {
          ok(
            await call(t.app, 'POST', `/admin/lessons/${lessonId}/resources`, {
              cookie,
              body: { type, title: type, externalUrl: url },
            }),
          );
        }
      }
    }
  }
  ok(await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie }));
  return { id: course.id, slug, ids };
}

const enrol = (who: { cookie: string }, courseId: string) =>
  call(t.app, 'POST', `/courses/${courseId}/enrollments`, { cookie: who.cookie });
const progress = (who: { cookie: string }, lessonId: string, body: Record<string, unknown> = {}) =>
  call(t.app, 'PUT', `/lessons/${lessonId}/progress`, { cookie: who.cookie, body });
const complete = async (who: { cookie: string }, lessonId: string) =>
  lessonProgressResultSchema.parse(ok(await progress(who, lessonId, { completed: true })));

describe('enrolment', () => {
  it('enrols once: a second request returns the same enrolment', async () => {
    const course = await publishedCourse([{ lessons: [{}] }]);
    const learner = await signedInLearner(t, 'enrol-twice');

    const first = await enrol(learner, course.id);
    expect(first.statusCode).toBe(201);
    const enrollment = enrollmentSchema.parse(dataOf(first));
    expect(enrollment).toMatchObject({ courseId: course.id, status: 'ACTIVE', completedAt: null });

    const second = await enrol(learner, course.id);
    expect(second.statusCode).toBe(200);
    expect(dataOf(second).id).toBe(enrollment.id);
  });

  it('enforces one enrolment per learner and course under concurrent requests', async () => {
    const course = await publishedCourse([{ lessons: [{}] }]);
    const learner = await signedInLearner(t, 'enrol-race');
    const responses = await Promise.all(Array.from({ length: 6 }, () => enrol(learner, course.id)));

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => dataOf(r).id)).size).toBe(1);
    expect(
      await t.db.enrollment.count({ where: { userId: learner.userId, courseId: course.id } }),
    ).toBe(1);
  });

  it('reactivates a withdrawn enrolment instead of creating another', async () => {
    const course = await publishedCourse([{ lessons: [{}] }]);
    const learner = await signedInLearner(t, 'enrol-again');
    const { id } = ok(await enrol(learner, course.id));
    await t.db.enrollment.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    expect(
      (await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: learner.cookie }))
        .statusCode,
    ).toBe(403);

    const again = await enrol(learner, course.id);
    expect(again.statusCode).toBe(200);
    expect(dataOf(again)).toMatchObject({ id, status: 'ACTIVE' });
  });

  it('only enrols signed-in learners in live courses', async () => {
    const course = await publishedCourse([{ lessons: [{}] }]);
    expect((await call(t.app, 'POST', `/courses/${course.id}/enrollments`)).statusCode).toBe(401);

    const learner = await signedInLearner(t, 'enrol-draft');
    const draft = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', '/admin/courses', {
          cookie: admin.cookie,
          body: { title: 'Unpublished', categoryId, slug: `draft-${Date.now().toString(36)}` },
        }),
      ),
    );
    const response = await enrol(learner, draft.id);
    expect(response.statusCode).toBe(404);
    expect(errorOf(response).code).toBe('RESOURCE_NOT_FOUND');

    ok(await call(t.app, 'POST', `/admin/courses/${course.id}/archive`, { cookie: admin.cookie }));
    expect((await enrol(learner, course.id)).statusCode).toBe(404);
  });
});

describe('protected content', () => {
  it('denies lessons, the course view and progress writes to learners who are not enrolled', async () => {
    const course = await publishedCourse([{ lessons: [{}] }]);
    const lessonId = course.ids[0]![0]!;
    const enrolled = await signedInLearner(t, 'insider');
    ok(await enrol(enrolled, course.id));
    const outsider = await signedInLearner(t, 'outsider');

    for (const response of [
      await call(t.app, 'GET', `/lessons/${lessonId}`, { cookie: outsider.cookie }),
      await progress(outsider, lessonId, { completed: true }),
      await call(t.app, 'GET', `/courses/${course.slug}/learning`, { cookie: outsider.cookie }),
    ]) {
      expect(response.statusCode).toBe(403);
      expect(errorOf(response).code).toBe('NOT_ENROLLED');
      expect(response.body).not.toContain('Text of 1.1');
    }
    expect(await t.db.lessonProgress.count({ where: { userId: outsider.userId } })).toBe(0);

    // Anonymous visitors get 401, and the enrolled learner gets the lesson.
    expect((await call(t.app, 'GET', `/lessons/${lessonId}`)).statusCode).toBe(401);
    const lesson = learnerLessonSchema.parse(
      ok(await call(t.app, 'GET', `/lessons/${lessonId}`, { cookie: enrolled.cookie })),
    );
    expect(lesson.content.blocks).toHaveLength(1);
  });

  it('returns 404 for lessons that are not in any live version', async () => {
    const learner = await signedInLearner(t, 'nowhere');
    const unknown = await call(t.app, 'GET', '/lessons/00000000-0000-4000-8000-000000000000', {
      cookie: learner.cookie,
    });
    expect(unknown.statusCode).toBe(404);

    // A lesson added to a live course after publishing stays hidden until the next publish.
    const course = await publishedCourse([{ lessons: [{}] }]);
    ok(await enrol(learner, course.id));
    const working = adminCourseSchema.parse(
      ok(
        await call(
          t.app,
          'POST',
          `/admin/modules/${(await t.db.module.findFirstOrThrow({ where: { courseId: course.id } })).id}/lessons`,
          {
            cookie: admin.cookie,
            body: { title: 'Not yet published' },
          },
        ),
      ),
    );
    const unpublished = working.modules[0]!.lessons[1]!.id;
    expect(
      (await call(t.app, 'GET', `/lessons/${unpublished}`, { cookie: learner.cookie })).statusCode,
    ).toBe(404);
  });

  it('opens modules in order and refuses locked lessons', async () => {
    const course = await publishedCourse([
      { lessons: [{}, { required: false }] },
      { lessons: [{}] },
    ]);
    const learner = await signedInLearner(t, 'locked');
    ok(await enrol(learner, course.id));
    const later = course.ids[1]![0]!;

    const locked = await call(t.app, 'GET', `/lessons/${later}`, { cookie: learner.cookie });
    expect(locked.statusCode).toBe(403);
    expect(errorOf(locked).code).toBe('LESSON_LOCKED');
    expect((await progress(learner, later, { completed: true })).statusCode).toBe(403);

    const view = learnerCourseSchema.parse(
      ok(await call(t.app, 'GET', `/courses/${course.slug}/learning`, { cookie: learner.cookie })),
    );
    expect(view.modules.map((m) => m.locked)).toEqual([false, true]);

    // The optional lesson doesn't hold the next module back.
    await complete(learner, course.ids[0]![0]!);
    expect(
      (await call(t.app, 'GET', `/lessons/${later}`, { cookie: learner.cookie })).statusCode,
    ).toBe(200);
  });
});

describe('progress', () => {
  it('is idempotent: retries keep one row, the first completion time and the highest percentage', async () => {
    const course = await publishedCourse([
      { lessons: [{ type: 'VIDEO', rule: 'MEDIA_FINISHED' }, {}] },
    ]);
    const learner = await signedInLearner(t, 'retry');
    ok(await enrol(learner, course.id));
    const [video, reading] = course.ids[0]!;

    // Out-of-order and duplicated writes from several tabs.
    await Promise.all([
      progress(learner, video!, { progressPercent: 40, positionSeconds: 120 }),
      progress(learner, video!, { progressPercent: 60, positionSeconds: 180 }),
      progress(learner, video!, { progressPercent: 60, positionSeconds: 180 }),
    ]);
    const later = lessonProgressResultSchema.parse(
      ok(await progress(learner, video!, { progressPercent: 30 })),
    );
    expect(later.progress).toMatchObject({ state: 'IN_PROGRESS', progressPercent: 60 });
    expect(
      await t.db.lessonProgress.count({ where: { userId: learner.userId, lessonId: video! } }),
    ).toBe(1);

    const first = await complete(learner, reading!);
    const retried = await complete(learner, reading!);
    expect(first.progress.state).toBe('COMPLETED');
    expect(retried.progress.completedAt).toBe(first.progress.completedAt);
    // A later write without `completed` never un-completes the lesson.
    const after = lessonProgressResultSchema.parse(ok(await progress(learner, reading!, {})));
    expect(after.progress).toMatchObject({
      state: 'COMPLETED',
      completedAt: first.progress.completedAt,
    });
  });

  it('completes lessons by their completion rule, not by opening them', async () => {
    const course = await publishedCourse([
      { lessons: [{}, { rule: 'VIEW' }, { type: 'VIDEO', rule: 'MEDIA_FINISHED' }] },
    ]);
    const learner = await signedInLearner(t, 'rules');
    ok(await enrol(learner, course.id));
    const [marked, viewed, video] = course.ids[0]!;

    // Mark complete: opening (an empty progress write) starts it but doesn't finish it.
    expect(
      lessonProgressResultSchema.parse(ok(await progress(learner, marked!))).progress.state,
    ).toBe('IN_PROGRESS');
    expect((await complete(learner, marked!)).progress.state).toBe('COMPLETED');

    // View: opening it is the rule.
    expect(
      lessonProgressResultSchema.parse(ok(await progress(learner, viewed!))).progress.state,
    ).toBe('COMPLETED');

    // Media: asking to complete before the end is refused; playing to the end completes it.
    const early = await progress(learner, video!, { progressPercent: 50, completed: true });
    expect(early.statusCode).toBe(422);
    expect(errorOf(early).code).toBe('COMPLETION_RULE_NOT_MET');
    const end = lessonProgressResultSchema.parse(
      ok(await progress(learner, video!, { progressPercent: 97 })),
    );
    expect(end.progress.state).toBe('COMPLETED');
    expect(end.course).toMatchObject({ enrollmentStatus: 'COMPLETED', progress: { percent: 100 } });
  });

  it('rejects out-of-range values', async () => {
    const course = await publishedCourse([{ lessons: [{}] }]);
    const learner = await signedInLearner(t, 'range');
    ok(await enrol(learner, course.id));
    for (const body of [
      { progressPercent: 101 },
      { positionSeconds: -1 },
      { completed: false },
      { userId: learner.userId },
    ]) {
      expect((await progress(learner, course.ids[0]![0]!, body)).statusCode).toBe(422);
    }
  });

  it('completes the course when every required lesson is complete', async () => {
    const course = await publishedCourse([
      { lessons: [{}, { required: false }] },
      { required: false, lessons: [{}] },
      { lessons: [{}] },
    ]);
    const learner = await signedInLearner(t, 'finisher');
    ok(await enrol(learner, course.id));

    const halfway = await complete(learner, course.ids[0]![0]!);
    expect(halfway.course).toMatchObject({
      enrollmentStatus: 'ACTIVE',
      completedAt: null,
      progress: { completedLessons: 1, requiredLessons: 2, totalLessons: 4, percent: 50 },
    });

    const done = await complete(learner, course.ids[2]![0]!);
    expect(done.course.enrollmentStatus).toBe('COMPLETED');
    expect(done.course.completedAt).not.toBeNull();

    // Optional lessons stay open afterwards and don't change the completion time.
    const optional = await complete(learner, course.ids[0]![1]!);
    expect(optional.course.completedAt).toBe(done.course.completedAt);

    const completed = ok(
      await call(t.app, 'GET', '/users/me/enrollments?status=completed', {
        cookie: learner.cookie,
      }),
    );
    expect(completed.map((c: { id: string }) => c.id)).toContain(course.id);
    const inProgress = ok(
      await call(t.app, 'GET', '/users/me/enrollments?status=in-progress', {
        cookie: learner.cookie,
      }),
    );
    expect(inProgress.map((c: { id: string }) => c.id)).not.toContain(course.id);
  });

  it('keeps the resume position across sessions and devices', async () => {
    const course = await publishedCourse([
      { lessons: [{}, { type: 'VIDEO', rule: 'MEDIA_FINISHED' }, {}] },
    ]);
    const learner = await signedInLearner(t, 'resume');
    ok(await enrol(learner, course.id));
    const [first, video] = course.ids[0]!;
    await complete(learner, first!);
    ok(await progress(learner, video!, { positionSeconds: 42, progressPercent: 20 }));

    // A second device signs in with its own session.
    const login = await call(t.app, 'POST', '/auth/login', {
      body: { email: learner.email, password: STRONG_PASSWORD },
    });
    const other = { cookie: sessionCookieFrom(login) };
    expect(other.cookie).not.toBe(learner.cookie);

    const lesson = learnerLessonSchema.parse(
      ok(await call(t.app, 'GET', `/lessons/${video}`, { cookie: other.cookie })),
    );
    expect(lesson.progress).toMatchObject({
      state: 'IN_PROGRESS',
      positionSeconds: 42,
      progressPercent: 20,
    });

    const resume = enrolledCourseSchema.parse(
      ok(await call(t.app, 'GET', '/users/me/continue-learning', { cookie: other.cookie })),
    );
    expect(resume).toMatchObject({
      id: course.id,
      nextLesson: { id: video, moduleNumber: 1, lessonNumber: 2 },
    });
    expect(resume.progress).toMatchObject({ completedLessons: 1, requiredLessons: 3, percent: 33 });
  });

  it("never shows one learner another learner's progress", async () => {
    const course = await publishedCourse([{ lessons: [{}] }]);
    const a = await signedInLearner(t, 'learner-a');
    const b = await signedInLearner(t, 'learner-b');
    ok(await enrol(a, course.id));
    ok(await enrol(b, course.id));
    await complete(a, course.ids[0]![0]!);

    const lesson = learnerLessonSchema.parse(
      ok(await call(t.app, 'GET', `/lessons/${course.ids[0]![0]}`, { cookie: b.cookie })),
    );
    expect(lesson.progress.state).toBe('NOT_STARTED');
    const mine = ok(await call(t.app, 'GET', '/users/me/enrollments', { cookie: b.cookie }));
    expect(mine.find((c: { id: string }) => c.id === course.id).progress.completedLessons).toBe(0);
  });
});

describe('versions', () => {
  it('moves learners to a republished version and keeps their progress', async () => {
    const course = await publishedCourse([{ lessons: [{}, {}] }]);
    const learner = await signedInLearner(t, 'republish');
    ok(await enrol(learner, course.id));
    await complete(learner, course.ids[0]![0]!);

    const moduleId = (await t.db.module.findFirstOrThrow({ where: { courseId: course.id } })).id;
    const working = adminCourseSchema.parse(
      ok(
        await call(t.app, 'POST', `/admin/modules/${moduleId}/lessons`, {
          cookie: admin.cookie,
          body: { title: 'Added later' },
        }),
      ),
    );
    const added = working.modules[0]!.lessons[2]!.id;
    ok(
      await call(t.app, 'PATCH', `/admin/lessons/${added}`, {
        cookie: admin.cookie,
        body: { estimatedMinutes: 3, content: { schemaVersion: 1, blocks: [{ type: 'divider' }] } },
      }),
    );
    ok(await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }));

    const view = learnerCourseSchema.parse(
      ok(await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: learner.cookie })),
    );
    expect(view.version).toBe(2);
    expect(view.progress).toMatchObject({ completedLessons: 1, requiredLessons: 3 });
    expect(
      (await call(t.app, 'GET', `/lessons/${added}`, { cookie: learner.cookie })).statusCode,
    ).toBe(200);
  });

  it('keeps an archived course open to enrolled learners only', async () => {
    const course = await publishedCourse([{ lessons: [{}] }]);
    const enrolled = await signedInLearner(t, 'archived-in');
    ok(await enrol(enrolled, course.id));
    ok(await call(t.app, 'POST', `/admin/courses/${course.id}/archive`, { cookie: admin.cookie }));
    const outsider = await signedInLearner(t, 'archived-out');

    const lessonId = course.ids[0]![0]!;
    expect(
      (await call(t.app, 'GET', `/lessons/${lessonId}`, { cookie: enrolled.cookie })).statusCode,
    ).toBe(200);
    expect(
      (await call(t.app, 'GET', `/lessons/${lessonId}`, { cookie: outsider.cookie })).statusCode,
    ).toBe(404);
    expect(
      (await call(t.app, 'GET', `/courses/${course.id}/learning`, { cookie: outsider.cookie }))
        .statusCode,
    ).toBe(404);
  });
});
