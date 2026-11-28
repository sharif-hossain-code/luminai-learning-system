/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any --
   assertions read loosely typed JSON bodies; responses that matter are parsed with the contract schemas. */
import {
  adminCourseSchema,
  catalogCourseDetailSchema,
  catalogCourseSchema,
  courseSnapshotSchema,
  errorEnvelopeSchema,
  type AdminCourse,
} from '@luminai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeAdmin, signedInLearner, startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let admin: { cookie: string; userId: string };
let editor: { cookie: string; userId: string };
let otherEditor: { cookie: string; userId: string };
let learner: { cookie: string; userId: string };
let categoryId: string;

async function makeEditor(userId: string) {
  const role = await t.db.role.findUniqueOrThrow({ where: { code: 'CONTENT_EDITOR' } });
  await t.db.user.update({ where: { id: userId }, data: { roleId: role.id } });
}

beforeAll(async () => {
  t = await startTestApp();
  admin = await signedInLearner(t, 'course-admin');
  await makeAdmin(t.db, admin.userId);
  editor = await signedInLearner(t, 'course-editor');
  await makeEditor(editor.userId);
  otherEditor = await signedInLearner(t, 'other-editor');
  await makeEditor(otherEditor.userId);
  learner = await signedInLearner(t, 'course-learner');
  categoryId = (await t.db.category.findUniqueOrThrow({ where: { slug: 'communication' } })).id;
});

afterAll(async () => {
  await t?.close();
});

const errorOf = (response: { json: () => unknown }) =>
  errorEnvelopeSchema.parse(response.json()).error;
/** The `data` of a success response, typed loosely for assertions. */
const dataOf = (response: { json: () => unknown }): any =>
  (response.json() as { data: unknown }).data;
const courseOf = (response: { json: () => unknown; statusCode: number; body: string }) => {
  if (response.statusCode >= 300) throw new Error(`${response.statusCode}: ${response.body}`);
  return adminCourseSchema.parse((response.json() as { data: unknown }).data);
};

let slugCounter = 0;
const uniqueSlug = (label: string) => `${label}-${Date.now().toString(36)}-${(slugCounter += 1)}`;

/** Creates a course as `who` and fills it until it passes every publish check. */
async function completeCourse(who: { cookie: string }, title = 'Public speaking essentials') {
  const slug = uniqueSlug('speaking');
  let course = courseOf(
    await call(t.app, 'POST', '/admin/courses', {
      cookie: who.cookie,
      body: { title, categoryId, slug },
    }),
  );
  course = courseOf(
    await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
      cookie: who.cookie,
      body: {
        summary: 'Plan, rehearse and deliver a short talk.',
        description: 'A practical course.\n\nFour short modules.',
        level: 'BEGINNER',
        estimatedMinutes: 300,
        outcomes: ['Open and close a talk with intent'],
        keywords: ['presentation', 'stage fright'],
      },
    }),
  );
  course = courseOf(
    await call(t.app, 'POST', `/admin/courses/${course.id}/modules`, {
      cookie: who.cookie,
      body: { title: 'Getting started' },
    }),
  );
  const moduleId = course.modules[0]!.id;
  course = courseOf(
    await call(t.app, 'POST', `/admin/modules/${moduleId}/lessons`, {
      cookie: who.cookie,
      body: { title: 'Why pauses matter' },
    }),
  );
  const lessonId = course.modules[0]!.lessons[0]!.id;
  course = courseOf(
    await call(t.app, 'PATCH', `/admin/lessons/${lessonId}`, {
      cookie: who.cookie,
      body: {
        estimatedMinutes: 8,
        content: {
          schemaVersion: 1,
          blocks: [{ type: 'paragraph', content: [{ text: 'A pause gives listeners time.' }] }],
        },
      },
    }),
  );
  return course;
}

describe('catalogue visibility', () => {
  it('hides drafts and courses in review from learners and anonymous visitors', async () => {
    const course = await completeCourse(editor, 'Hidden draft course');
    const list = await call(t.app, 'GET', '/catalog/courses?q=hidden', { cookie: learner.cookie });
    expect(list.statusCode).toBe(200);
    expect(dataOf(list).map((c: { id: string }) => c.id)).not.toContain(course.id);

    for (const key of [course.id, course.slug]) {
      expect((await call(t.app, 'GET', `/catalog/courses/${key}`)).statusCode).toBe(404);
    }

    courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/submit-for-review`, {
        cookie: editor.cookie,
      }),
    );
    expect((await call(t.app, 'GET', `/catalog/courses/${course.slug}`)).statusCode).toBe(404);
  });

  it('shows a published course, and keeps later edits hidden until the next publish', async () => {
    const draft = await completeCourse(admin, 'Presenting with confidence');
    const published = courseOf(
      await call(t.app, 'POST', `/admin/courses/${draft.id}/publish`, { cookie: admin.cookie }),
    );
    expect(published).toMatchObject({
      status: 'PUBLISHED',
      liveVersion: 1,
      hasUnpublishedChanges: false,
    });

    const detail = await call(t.app, 'GET', `/catalog/courses/${draft.slug}`);
    expect(detail.statusCode).toBe(200);
    const body = catalogCourseDetailSchema.parse(dataOf(detail));
    expect(body).toMatchObject({ title: 'Presenting with confidence', version: 1, lessonCount: 1 });
    // The outline has no lesson content.
    expect(JSON.stringify(detail.json())).not.toContain('A pause gives listeners time.');

    const edited = courseOf(
      await call(t.app, 'PATCH', `/admin/courses/${draft.id}`, {
        cookie: admin.cookie,
        body: { title: 'Presenting with confidence (new edition)' },
      }),
    );
    expect(edited.hasUnpublishedChanges).toBe(true);
    const stillOld = catalogCourseDetailSchema.parse(
      dataOf(await call(t.app, 'GET', `/catalog/courses/${draft.id}`)),
    );
    expect(stillOld.title).toBe('Presenting with confidence');

    courseOf(
      await call(t.app, 'POST', `/admin/courses/${draft.id}/publish`, { cookie: admin.cookie }),
    );
    const updated = catalogCourseDetailSchema.parse(
      dataOf(await call(t.app, 'GET', `/catalog/courses/${draft.id}`)),
    );
    expect(updated).toMatchObject({
      title: 'Presenting with confidence (new edition)',
      version: 2,
    });
  });

  it('hides archived courses and lists every published version', async () => {
    const course = await completeCourse(admin, 'Course to archive');
    courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }),
    );
    const archived = courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/archive`, { cookie: admin.cookie }),
    );
    expect(archived.status).toBe('ARCHIVED');
    expect((await call(t.app, 'GET', `/catalog/courses/${course.slug}`)).statusCode).toBe(404);

    const versions = await call(t.app, 'GET', `/admin/courses/${course.id}/versions`, {
      cookie: admin.cookie,
    });
    expect(dataOf(versions)).toEqual([
      expect.objectContaining({ version: 1, live: false, title: 'Course to archive' }),
    ]);

    // Publishing again restores it as a new version.
    courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }),
    );
    expect((await call(t.app, 'GET', `/catalog/courses/${course.slug}`)).statusCode).toBe(200);
  });

  it('stores an immutable snapshot per version', async () => {
    const course = await completeCourse(admin, 'Snapshot course');
    courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }),
    );
    courseOf(
      await call(t.app, 'PATCH', `/admin/lessons/${course.modules[0]!.lessons[0]!.id}`, {
        cookie: admin.cookie,
        body: { title: 'Renamed in the draft' },
      }),
    );
    const version = await t.db.courseVersion.findFirstOrThrow({ where: { courseId: course.id } });
    const snapshot = courseSnapshotSchema.parse(version.snapshot);
    expect(snapshot.modules[0]!.lessons[0]!.title).toBe('Why pauses matter');
    expect(version.draftRevision).toBeGreaterThan(1);
  });
});

describe('catalogue search, filters and pagination', () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const language = (await t.db.category.findUniqueOrThrow({ where: { slug: 'language' } })).id;
    const specs = [
      {
        key: 'negotiation',
        title: 'Negotiation basics zq',
        level: 'INTERMEDIATE',
        minutes: 300,
        cat: categoryId,
        rank: null,
      },
      {
        key: 'writing',
        title: 'Professional writing zq',
        level: 'INTERMEDIATE',
        minutes: 120,
        cat: language,
        rank: 1,
      },
      {
        key: 'fluency',
        title: 'Pronunciation and fluency zq',
        level: 'ADVANCED',
        minutes: 600,
        cat: language,
        rank: null,
      },
    ] as const;
    for (const spec of specs) {
      const course = await completeCourse(admin, spec.title);
      courseOf(
        await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
          cookie: admin.cookie,
          body: {
            level: spec.level,
            estimatedMinutes: spec.minutes,
            categoryId: spec.cat,
            featuredRank: spec.rank,
            keywords: spec.key === 'negotiation' ? ['bargaining'] : [],
          },
        }),
      );
      courseOf(
        await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }),
      );
      ids[spec.key] = course.id;
    }
  });

  const search = async (query: string) => {
    const response = await call(t.app, 'GET', `/catalog/courses?${query}`);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: unknown[]; pagination: { total: number } }>();
    return {
      ids: body.data.map((row) => catalogCourseSchema.parse(row).id),
      total: body.pagination.total,
    };
  };

  it('finds courses by title, by keyword and by partial word', async () => {
    expect((await search('q=negotiation')).ids).toContain(ids.negotiation);
    expect((await search('q=bargaining')).ids).toEqual([ids.negotiation]);
    expect((await search('q=pronunc')).ids).toEqual([ids.fluency]);
    expect((await search('q=%25%25')).ids).toEqual([]);
  });

  it('filters by category, level and length', async () => {
    expect((await search('q=zq&category=language')).ids.sort()).toEqual(
      [ids.writing, ids.fluency].sort(),
    );
    expect((await search('q=zq&level=ADVANCED')).ids).toEqual([ids.fluency]);
    expect((await search('q=zq&duration=short')).ids).toEqual([ids.writing]);
    expect((await search('q=zq&duration=medium')).ids).toEqual([ids.negotiation]);
    expect((await search('q=zq&duration=long')).ids).toEqual([ids.fluency]);
  });

  it('puts featured courses first in the curated order and paginates', async () => {
    const curated = await search('q=zq&sort=curated');
    expect(curated.ids[0]).toBe(ids.writing);
    const page1 = await search('q=zq&sort=curated&pageSize=2&page=1');
    const page2 = await search('q=zq&sort=curated&pageSize=2&page=2');
    expect(page1.total).toBe(3);
    expect(page1.ids).toHaveLength(2);
    expect(page2.ids).toHaveLength(1);
    expect(new Set([...page1.ids, ...page2.ids]).size).toBe(3);
  });

  it('rejects invalid filters', async () => {
    expect((await call(t.app, 'GET', '/catalog/courses?level=EXPERT')).statusCode).toBe(422);
    expect((await call(t.app, 'GET', '/catalog/courses?pageSize=1000')).statusCode).toBe(422);
  });

  it('lists active categories in order', async () => {
    const response = await call(t.app, 'GET', '/catalog/categories');
    expect(
      dataOf(response)
        .slice(0, 3)
        .map((c: { slug: string }) => c.slug),
    ).toEqual(['language', 'communication', 'leadership']);
  });
});

describe('authorization', () => {
  it('rejects learners and anonymous callers on every authoring route', async () => {
    const course = await completeCourse(editor);
    const routes: [Parameters<typeof call>[1], string][] = [
      ['GET', '/admin/courses'],
      ['POST', '/admin/courses'],
      ['GET', `/admin/courses/${course.id}`],
      ['PATCH', `/admin/courses/${course.id}`],
      ['POST', `/admin/courses/${course.id}/publish`],
      ['POST', `/admin/courses/${course.id}/modules`],
      ['PATCH', `/admin/lessons/${course.modules[0]!.lessons[0]!.id}`],
      ['GET', '/admin/categories'],
    ];
    for (const [method, path] of routes) {
      const asLearner = await call(t.app, method, path, { cookie: learner.cookie, body: {} });
      expect(asLearner.statusCode, `${method} ${path}`).toBe(403);
      const anonymous = await call(t.app, method, path, { body: {} });
      expect(anonymous.statusCode, `${method} ${path}`).toBe(401);
    }
  });

  it("stops an editor from touching another editor's course", async () => {
    const course = await completeCourse(editor);
    const moduleId = course.modules[0]!.id;
    const lessonId = course.modules[0]!.lessons[0]!.id;
    const attempts: [Parameters<typeof call>[1], string, unknown][] = [
      ['GET', `/admin/courses/${course.id}`, undefined],
      ['GET', `/admin/courses/${course.id}/preview`, undefined],
      ['PATCH', `/admin/courses/${course.id}`, { title: 'Hijacked' }],
      ['DELETE', `/admin/courses/${course.id}`, undefined],
      ['POST', `/admin/courses/${course.id}/modules`, { title: 'Extra' }],
      ['PATCH', `/admin/modules/${moduleId}`, { title: 'Hijacked' }],
      ['DELETE', `/admin/modules/${moduleId}`, undefined],
      ['PATCH', `/admin/lessons/${lessonId}`, { title: 'Hijacked' }],
      [
        'POST',
        `/admin/lessons/${lessonId}/resources`,
        { type: 'LINK', title: 'x', externalUrl: 'https://example.com' },
      ],
      ['POST', `/admin/courses/${course.id}/submit-for-review`, undefined],
    ];
    for (const [method, path, body] of attempts) {
      const response = await call(t.app, method, path, { cookie: otherEditor.cookie, body });
      expect(response.statusCode, `${method} ${path}`).toBe(403);
    }
    const listed = await call(t.app, 'GET', '/admin/courses', { cookie: otherEditor.cookie });
    expect(dataOf(listed).map((c: { id: string }) => c.id)).not.toContain(course.id);
    const unchanged = await t.db.course.findUniqueOrThrow({ where: { id: course.id } });
    expect(unchanged.title).toBe('Public speaking essentials');
  });

  it('lets editors submit for review but not publish, archive, feature or reassign', async () => {
    const course = await completeCourse(editor);
    const publish = await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, {
      cookie: editor.cookie,
    });
    expect(publish.statusCode).toBe(403);
    const feature = await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
      cookie: editor.cookie,
      body: { featuredRank: 1 },
    });
    expect(feature.statusCode).toBe(403);
    const reassign = await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
      cookie: editor.cookie,
      body: { ownerId: otherEditor.userId },
    });
    expect(reassign.statusCode).toBe(403);
    const createCategory = await call(t.app, 'POST', '/admin/categories', {
      cookie: editor.cookie,
      body: { slug: 'editors-cannot', name: 'Nope' },
    });
    expect(createCategory.statusCode).toBe(403);

    const submitted = courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/submit-for-review`, {
        cookie: editor.cookie,
      }),
    );
    expect(submitted.status).toBe('REVIEW');
    expect(submitted.permissions).toEqual({ canPublish: false, canArchive: false });

    // An administrator publishes, and the action is audited.
    courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }),
    );
    const events = await t.db.auditEvent.findMany({
      where: { resourceType: 'course', resourceId: course.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.action)).toEqual([
      'course.created',
      'course.submitted_for_review',
      'course.published',
    ]);
    expect(events.at(-1)?.actorUserId).toBe(admin.userId);
  });

  it('lets an administrator hand a course to another editor', async () => {
    const course = await completeCourse(editor);
    const moved = courseOf(
      await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
        cookie: admin.cookie,
        body: { ownerId: otherEditor.userId },
      }),
    );
    expect(moved.owner.id).toBe(otherEditor.userId);
    expect(
      (await call(t.app, 'GET', `/admin/courses/${course.id}`, { cookie: otherEditor.cookie }))
        .statusCode,
    ).toBe(200);
    expect(
      (await call(t.app, 'GET', `/admin/courses/${course.id}`, { cookie: editor.cookie }))
        .statusCode,
    ).toBe(403);

    const toLearner = await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
      cookie: admin.cookie,
      body: { ownerId: learner.userId },
    });
    expect(toLearner.statusCode).toBe(422);
  });
});

describe('ordering', () => {
  it('keeps module and lesson order deterministic and reorders exactly', async () => {
    let course = await completeCourse(editor);
    const courseId = course.id;
    for (const title of ['Second', 'Third']) {
      course = courseOf(
        await call(t.app, 'POST', `/admin/courses/${courseId}/modules`, {
          cookie: editor.cookie,
          body: { title },
        }),
      );
    }
    expect(course.modules.map((m) => [m.title, m.position])).toEqual([
      ['Getting started', 0],
      ['Second', 1],
      ['Third', 2],
    ]);

    // Ties in position (e.g. from concurrent inserts) still resolve the same way every time.
    await t.db.module.updateMany({ where: { courseId }, data: { position: 0 } });
    const first = courseOf(
      await call(t.app, 'GET', `/admin/courses/${courseId}`, { cookie: editor.cookie }),
    );
    const second = courseOf(
      await call(t.app, 'GET', `/admin/courses/${courseId}`, { cookie: editor.cookie }),
    );
    expect(first.modules.map((m) => m.id)).toEqual(second.modules.map((m) => m.id));
    expect(first.modules.map((m) => m.id)).toEqual([...first.modules.map((m) => m.id)].sort());

    const reversed = [...course.modules].reverse().map((m) => m.id);
    course = courseOf(
      await call(t.app, 'PUT', `/admin/courses/${courseId}/module-order`, {
        cookie: editor.cookie,
        body: { ids: reversed },
      }),
    );
    expect(course.modules.map((m) => m.id)).toEqual(reversed);
    expect(course.modules.map((m) => m.position)).toEqual([0, 1, 2]);

    // A partial list, a duplicate or another course's module is refused.
    for (const ids of [reversed.slice(1), [reversed[0], reversed[0], reversed[1]]]) {
      const response = await call(t.app, 'PUT', `/admin/courses/${courseId}/module-order`, {
        cookie: editor.cookie,
        body: { ids },
      });
      expect(response.statusCode).toBe(422);
    }

    // Lessons: add two, reorder, delete one; positions stay compact.
    const moduleId = course.modules.find((m) => m.title === 'Getting started')!.id;
    for (const title of ['B', 'C']) {
      course = courseOf(
        await call(t.app, 'POST', `/admin/modules/${moduleId}/lessons`, {
          cookie: editor.cookie,
          body: { title },
        }),
      );
    }
    const lessons = () => course.modules.find((m) => m.id === moduleId)!.lessons;
    const order = [lessons()[2]!.id, lessons()[0]!.id, lessons()[1]!.id];
    course = courseOf(
      await call(t.app, 'PUT', `/admin/modules/${moduleId}/lesson-order`, {
        cookie: editor.cookie,
        body: { ids: order },
      }),
    );
    expect(lessons().map((l) => l.id)).toEqual(order);
    course = courseOf(
      await call(t.app, 'DELETE', `/admin/lessons/${order[1]}`, { cookie: editor.cookie }),
    );
    expect(lessons().map((l) => [l.id, l.position])).toEqual([
      [order[0], 0],
      [order[2], 1],
    ]);
  });

  it('publishes modules and lessons in the authored order', async () => {
    let course = await completeCourse(admin, 'Ordered course');
    course = courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/modules`, {
        cookie: admin.cookie,
        body: { title: 'Module two' },
      }),
    );
    const second = course.modules[1]!.id;
    course = courseOf(
      await call(t.app, 'POST', `/admin/modules/${second}/lessons`, {
        cookie: admin.cookie,
        body: { title: 'Lesson two' },
      }),
    );
    course = courseOf(
      await call(t.app, 'PATCH', `/admin/lessons/${course.modules[1]!.lessons[0]!.id}`, {
        cookie: admin.cookie,
        body: {
          estimatedMinutes: 5,
          content: { schemaVersion: 1, blocks: [{ type: 'reflection', prompt: 'Think.' }] },
        },
      }),
    );
    course = courseOf(
      await call(t.app, 'PUT', `/admin/courses/${course.id}/module-order`, {
        cookie: admin.cookie,
        body: { ids: [second, course.modules[0]!.id] },
      }),
    );
    courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }),
    );
    const detail = catalogCourseDetailSchema.parse(
      dataOf(await call(t.app, 'GET', `/catalog/courses/${course.id}`)),
    );
    expect(detail.modules.map((m) => m.title)).toEqual(['Module two', 'Getting started']);
  });
});

describe('publish validation', () => {
  const issuesOf = (response: { json: () => unknown }) =>
    errorOf(response).fieldErrors.map((issue) => issue.field);

  it('blocks publishing an empty course and lists what is missing', async () => {
    const course = courseOf(
      await call(t.app, 'POST', '/admin/courses', {
        cookie: admin.cookie,
        body: { title: 'Empty course', categoryId },
      }),
    );
    expect(course.publishIssues.map((issue) => issue.path)).toEqual([
      'course.summary',
      'course.description',
      'course.outcomes',
      'course.estimatedMinutes',
      'course.modules',
    ]);
    const response = await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, {
      cookie: admin.cookie,
    });
    expect(response.statusCode).toBe(422);
    expect(errorOf(response).code).toBe('PUBLISH_VALIDATION_FAILED');
    expect(issuesOf(response)).toContain('course.modules');
    expect(await t.db.courseVersion.count({ where: { courseId: course.id } })).toBe(0);

    const submit = await call(t.app, 'POST', `/admin/courses/${course.id}/submit-for-review`, {
      cookie: admin.cookie,
    });
    expect(submit.statusCode).toBe(422);
  });

  it('blocks modules without lessons and lessons without content', async () => {
    let course = await completeCourse(admin);
    course = courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/modules`, {
        cookie: admin.cookie,
        body: { title: 'Empty' },
      }),
    );
    course = courseOf(
      await call(t.app, 'POST', `/admin/modules/${course.modules[0]!.id}/lessons`, {
        cookie: admin.cookie,
        body: { title: 'No content yet' },
      }),
    );
    const emptyModule = course.modules[1]!.id;
    const emptyLesson = course.modules[0]!.lessons[1]!.id;
    const response = await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, {
      cookie: admin.cookie,
    });
    expect(response.statusCode).toBe(422);
    expect(issuesOf(response)).toEqual([
      `lesson:${emptyLesson}`, // no content
      `lesson:${emptyLesson}`, // no duration
      `module:${emptyModule}`,
    ]);
  });

  it('requires the media plus captions or a transcript for video lessons', async () => {
    let course = await completeCourse(admin);
    const lessonId = course.modules[0]!.lessons[0]!.id;
    course = courseOf(
      await call(t.app, 'PATCH', `/admin/lessons/${lessonId}`, {
        cookie: admin.cookie,
        body: { type: 'VIDEO', completionRule: 'MEDIA_FINISHED' },
      }),
    );
    expect(course.publishIssues.map((issue) => issue.message)).toEqual([
      'Why pauses matter: Add the video.',
      'Why pauses matter: Add captions or a transcript, so everyone can follow the video.',
    ]);
    for (const [type, title] of [
      ['VIDEO', 'Talk recording'],
      ['TRANSCRIPT', 'Transcript'],
    ] as const) {
      course = courseOf(
        await call(t.app, 'POST', `/admin/lessons/${lessonId}/resources`, {
          cookie: admin.cookie,
          body: { type, title, externalUrl: `https://media.example.com/${type.toLowerCase()}` },
        }),
      );
    }
    expect(course.publishIssues).toEqual([]);
    courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }),
    );
  });

  it('refuses to publish when nothing changed, and locks the slug after first publish', async () => {
    const course = await completeCourse(admin);
    courseOf(
      await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, { cookie: admin.cookie }),
    );
    const again = await call(t.app, 'POST', `/admin/courses/${course.id}/publish`, {
      cookie: admin.cookie,
    });
    expect(again.statusCode).toBe(409);
    const slug = await call(t.app, 'PATCH', `/admin/courses/${course.id}`, {
      cookie: admin.cookie,
      body: { slug: uniqueSlug('renamed') },
    });
    expect(slug.statusCode).toBe(409);
    const remove = await call(t.app, 'DELETE', `/admin/courses/${course.id}`, {
      cookie: admin.cookie,
    });
    expect(remove.statusCode).toBe(409);
  });
});

describe('rich text and resource safety', () => {
  async function lesson() {
    const course = await completeCourse(editor);
    return { course, lessonId: course.modules[0]!.lessons[0]!.id };
  }

  it('stores typed HTML as literal text and never as markup', async () => {
    const { course, lessonId } = await lesson();
    const updated = courseOf(
      await call(t.app, 'PATCH', `/admin/lessons/${lessonId}`, {
        cookie: editor.cookie,
        body: {
          content: {
            schemaVersion: 1,
            blocks: [{ type: 'paragraph', content: [{ text: '<script>alert(1)</script>‮drow' }] }],
          },
        },
      }),
    );
    expect(updated.modules[0]!.lessons[0]!.content.blocks[0]).toEqual({
      type: 'paragraph',
      content: [{ text: '<script>alert(1)</script>drow' }],
    });
    const preview = await call(t.app, 'GET', `/admin/courses/${course.id}/preview`, {
      cookie: editor.cookie,
    });
    expect(courseSnapshotSchema.safeParse(dataOf(preview)).success).toBe(true);
  });

  it.each([
    [{ schemaVersion: 1, blocks: [{ type: 'html', html: '<b>x</b>' }] }],
    [
      {
        schemaVersion: 1,
        blocks: [{ type: 'paragraph', content: [{ text: 'x', href: 'javascript:alert(1)' }] }],
      },
    ],
    [
      {
        schemaVersion: 1,
        blocks: [{ type: 'paragraph', content: [{ text: 'x', onclick: 'alert(1)' }] }],
      },
    ],
    [{ schemaVersion: 9, blocks: [] }],
    ['<p>raw html</p>'],
  ])('rejects unsafe content %#', async (content) => {
    const { lessonId } = await lesson();
    const response = await call(t.app, 'PATCH', `/admin/lessons/${lessonId}`, {
      cookie: editor.cookie,
      body: { content },
    });
    expect(response.statusCode).toBe(422);
  });

  it.each([
    'javascript:alert(1)',
    'http://example.com/video',
    'https://localhost/x',
    'https://10.0.0.1/x',
  ])('refuses the resource link %s', async (externalUrl) => {
    const { lessonId } = await lesson();
    const response = await call(t.app, 'POST', `/admin/lessons/${lessonId}/resources`, {
      cookie: editor.cookie,
      body: { type: 'LINK', title: 'Link', externalUrl },
    });
    expect(response.statusCode).toBe(422);
    expect(errorOf(response).fieldErrors[0]?.field).toBe('externalUrl');
  });
});

describe('categories', () => {
  it('lets administrators create, rename and deactivate categories (audited)', async () => {
    const slug = uniqueSlug('writing');
    const created = await call(t.app, 'POST', '/admin/categories', {
      cookie: admin.cookie,
      body: { slug, name: 'Business writing', displayOrder: 9 },
    });
    expect(created.statusCode).toBe(201);
    const id = dataOf(created).id as string;
    const duplicate = await call(t.app, 'POST', '/admin/categories', {
      cookie: admin.cookie,
      body: { slug, name: 'Again' },
    });
    expect(duplicate.statusCode).toBe(409);

    const hidden = await call(t.app, 'PATCH', `/admin/categories/${id}`, {
      cookie: admin.cookie,
      body: { isActive: false },
    });
    expect(dataOf(hidden).isActive).toBe(false);
    const publicList = await call(t.app, 'GET', '/catalog/categories');
    expect(dataOf(publicList).map((c: { slug: string }) => c.slug)).not.toContain(slug);
    expect(
      await t.db.auditEvent.count({ where: { resourceType: 'category', resourceId: id } }),
    ).toBe(2);

    const create = await call(t.app, 'POST', '/admin/courses', {
      cookie: editor.cookie,
      body: { title: 'In an inactive category', categoryId: id },
    });
    expect(create.statusCode).toBe(422);
  });
});

describe('course drafts', () => {
  it('makes a unique slug from the title and deletes never-published drafts', async () => {
    const first = courseOf(
      await call(t.app, 'POST', '/admin/courses', {
        cookie: editor.cookie,
        body: { title: 'Same title twice', categoryId },
      }),
    );
    const second: AdminCourse = courseOf(
      await call(t.app, 'POST', '/admin/courses', {
        cookie: editor.cookie,
        body: { title: 'Same title twice', categoryId },
      }),
    );
    expect(first.slug).toMatch(/^same-title-twice/);
    expect(second.slug).not.toBe(first.slug);
    const taken = await call(t.app, 'POST', '/admin/courses', {
      cookie: editor.cookie,
      body: { title: 'Explicit', categoryId, slug: first.slug },
    });
    expect(taken.statusCode).toBe(409);

    expect(
      (await call(t.app, 'DELETE', `/admin/courses/${second.id}`, { cookie: editor.cookie }))
        .statusCode,
    ).toBe(204);
    expect(await t.db.course.count({ where: { id: second.id } })).toBe(0);
  });
});
