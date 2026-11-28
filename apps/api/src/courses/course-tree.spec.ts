import { describe, expect, it } from 'vitest';
import { findPublishIssues, type ValidatableCourse } from './course-tree.js';

const content = (blocks: number) => ({
  schemaVersion: 1,
  blocks: Array.from({ length: blocks }, () => ({ type: 'divider' })),
});

function course(overrides: Partial<ValidatableCourse> = {}): ValidatableCourse {
  return {
    title: 'Course',
    summary: 'Summary',
    description: 'Description',
    estimatedMinutes: 60,
    outcomes: ['Outcome'],
    category: { isActive: true },
    modules: [
      {
        id: 'm1',
        title: 'Module',
        lessons: [
          {
            id: 'l1',
            title: 'Lesson',
            type: 'TEXT',
            content: content(1),
            estimatedMinutes: 5,
            completionRule: 'MARK_COMPLETE',
            resources: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

const lesson = (patch: Partial<ValidatableCourse['modules'][number]['lessons'][number]>) =>
  course({
    modules: [
      { id: 'm1', title: 'Module', lessons: [{ ...course().modules[0]!.lessons[0]!, ...patch }] },
    ],
  });

describe('findPublishIssues', () => {
  it('accepts a complete course', () => {
    expect(findPublishIssues(course())).toEqual([]);
  });

  it('requires the course details and at least one module', () => {
    const issues = findPublishIssues(
      course({ summary: ' ', description: '', outcomes: [], estimatedMinutes: 0, modules: [] }),
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      'course.summary',
      'course.description',
      'course.outcomes',
      'course.estimatedMinutes',
      'course.modules',
    ]);
  });

  it('rejects an inactive category', () => {
    expect(findPublishIssues(course({ category: { isActive: false } }))[0]?.path).toBe(
      'course.categoryId',
    );
  });

  it('checks each lesson type for what it needs', () => {
    const messages = (patch: Parameters<typeof lesson>[0]) =>
      findPublishIssues(lesson(patch)).map((issue) => issue.message.replace('Lesson: ', ''));
    expect(messages({ content: content(0) })).toEqual(['Add some lesson content.']);
    expect(messages({ type: 'AUDIO' })).toEqual([
      'Add the audio.',
      'Add a transcript, so everyone can follow the audio.',
    ]);
    expect(
      messages({ type: 'AUDIO', resources: [{ type: 'AUDIO' }, { type: 'TRANSCRIPT' }] }),
    ).toEqual([]);
    expect(
      messages({ type: 'VIDEO', resources: [{ type: 'VIDEO' }, { type: 'CAPTIONS' }] }),
    ).toEqual([]);
    expect(messages({ type: 'EXTERNAL_LINK' })).toEqual(['Add the link learners should open.']);
    expect(messages({ completionRule: 'MEDIA_FINISHED' })).toEqual([
      '"Finish the media" only works for video and audio lessons.',
    ]);
    expect(messages({ estimatedMinutes: 0 })).toEqual(['Set how many minutes the lesson takes.']);
  });
});
