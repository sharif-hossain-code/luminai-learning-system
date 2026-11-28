import { randomUUID } from 'node:crypto';
import type { CourseSnapshot } from '@luminai/contracts';
import { describe, expect, it } from 'vitest';
import { buildJourney, type ProgressRow } from './journey.js';

type LessonSpec = { minutes?: number; required?: boolean };

/** A snapshot with one module per entry; each module lists its lessons. */
function snapshot(
  modules: { required?: boolean; lessons: LessonSpec[] }[],
): CourseSnapshot & { ids: string[][] } {
  const ids = modules.map((module) => module.lessons.map(() => randomUUID()));
  return {
    ids,
    snapshotSchemaVersion: 1,
    course: {
      id: randomUUID(),
      slug: 'course',
      title: 'Course',
      summary: '',
      description: '',
      categoryId: randomUUID(),
      level: 'BEGINNER',
      estimatedMinutes: 60,
      outcomes: [],
      prerequisites: [],
      keywords: [],
      coverObjectKey: null,
    },
    modules: modules.map((module, m) => ({
      id: randomUUID(),
      title: `Module ${m + 1}`,
      description: '',
      isRequired: module.required ?? true,
      lessons: module.lessons.map((lesson, l) => ({
        id: ids[m]![l]!,
        title: `Lesson ${m + 1}.${l + 1}`,
        type: 'TEXT' as const,
        objectives: [],
        content: { schemaVersion: 1 as const, blocks: [] },
        estimatedMinutes: lesson.minutes ?? 10,
        completionRule: 'MARK_COMPLETE' as const,
        isRequired: lesson.required ?? true,
        resources: [],
      })),
    })),
  };
}

const done = (lessonId: string): ProgressRow => ({ lessonId, status: 'COMPLETED' });
const started = (lessonId: string): ProgressRow => ({ lessonId, status: 'IN_PROGRESS' });

describe('buildJourney', () => {
  it('starts at the first lesson with only the first module open', () => {
    const course = snapshot([{ lessons: [{}, {}] }, { lessons: [{}] }]);
    const journey = buildJourney(course, [], null);

    expect(journey.nextLesson).toMatchObject({
      id: course.ids[0]![0],
      moduleNumber: 1,
      lessonNumber: 1,
    });
    expect(journey.modules.map((m) => [m.state, m.locked])).toEqual([
      ['NOT_STARTED', false],
      ['NOT_STARTED', true],
    ]);
    expect(journey.progress).toEqual({
      completedLessons: 0,
      requiredLessons: 3,
      totalLessons: 3,
      percent: 0,
      remainingMinutes: 30,
    });
  });

  it('opens the next module once the required lessons before it are complete', () => {
    const course = snapshot([{ lessons: [{}, { required: false }] }, { lessons: [{}] }]);
    const journey = buildJourney(course, [done(course.ids[0]![0]!)], course.ids[0]![0]!);

    expect(journey.modules[0]!.state).toBe('COMPLETED');
    expect(journey.modules[1]!.locked).toBe(false);
    // The optional lesson is still offered next because it follows the last one opened.
    expect(journey.nextLesson?.id).toBe(course.ids[0]![1]);
    expect(journey.progress).toMatchObject({
      completedLessons: 1,
      requiredLessons: 2,
      percent: 50,
    });
  });

  it('does not let optional modules block later ones', () => {
    const course = snapshot([{ required: false, lessons: [{}] }, { lessons: [{}] }]);
    const journey = buildJourney(course, [], null);
    expect(journey.modules[1]!.locked).toBe(false);
    expect(journey.progress.requiredLessons).toBe(1);
  });

  it('completes the course when every required lesson is complete, ignoring optional ones', () => {
    const course = snapshot([{ lessons: [{}, { required: false }] }, { lessons: [{}] }]);
    const rows = [done(course.ids[0]![0]!), done(course.ids[1]![0]!)];
    const journey = buildJourney(course, rows, course.ids[1]![0]!);
    expect(journey.complete).toBe(true);
    expect(journey.progress).toMatchObject({ percent: 100, remainingMinutes: 0 });
  });

  it('counts every lesson when none is marked required', () => {
    const course = snapshot([{ lessons: [{ required: false }, { required: false }] }]);
    const half = buildJourney(course, [done(course.ids[0]![0]!)], null);
    expect(half).toMatchObject({ complete: false, progress: { requiredLessons: 2, percent: 50 } });
  });

  it('never rounds up to 100% before the course is complete', () => {
    const lessons = Array.from({ length: 200 }, () => ({}));
    const course = snapshot([{ lessons }]);
    const rows = course.ids[0]!.slice(0, 199).map(done);
    expect(buildJourney(course, rows, null).progress.percent).toBe(99);
  });

  it('resumes the last lesson opened while it is unfinished', () => {
    const course = snapshot([{ lessons: [{}, {}, {}] }]);
    const journey = buildJourney(course, [started(course.ids[0]![1]!)], course.ids[0]![1]!);
    expect(journey.nextLesson).toMatchObject({ id: course.ids[0]![1], state: 'IN_PROGRESS' });
  });

  it('moves past the last lesson once it is finished, then wraps to anything skipped', () => {
    const course = snapshot([{ lessons: [{}, {}, {}] }]);
    const [a, b, c] = course.ids[0]!;
    expect(buildJourney(course, [done(b!)], b!).nextLesson?.id).toBe(c);
    expect(buildJourney(course, [done(b!), done(c!)], c!).nextLesson?.id).toBe(a);
    expect(buildJourney(course, [done(a!), done(b!), done(c!)], c!).nextLesson).toBeNull();
  });

  it('keeps a started lesson open even if its module becomes locked by a republish', () => {
    const course = snapshot([{ lessons: [{}, {}] }, { lessons: [{}, {}] }]);
    // Module 1 gained a required lesson the learner hasn't done.
    const rows = [done(course.ids[0]![0]!), started(course.ids[1]![0]!)];
    const journey = buildJourney(course, rows, null);
    const second = journey.modules[1]!;
    expect(second.locked).toBe(false);
    expect(second.lessons.map((lesson) => lesson.locked)).toEqual([false, true]);
  });
});
