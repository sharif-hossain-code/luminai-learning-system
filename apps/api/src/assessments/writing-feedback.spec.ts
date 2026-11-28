import { describe, expect, it } from 'vitest';
import {
  boundFeedback,
  FEEDBACK_NOTICE,
  MockWritingFeedbackProvider,
  unavailableFeedback,
  type Rubric,
} from './writing-feedback.js';

const rubric: Rubric = {
  criteria: [
    { id: 'hook', label: 'Hooks attention', description: 'Opens with something surprising.' },
    { id: 'plain', label: 'States the news plainly', description: '' },
  ],
  minWords: 5,
  maxWords: 60,
};
const now = new Date('2026-11-28T10:00:00Z');

describe('boundFeedback', () => {
  it('keeps only rubric criteria, in rubric order, and marks the result as AI-generated', () => {
    const feedback = boundFeedback(
      {
        criteria: [
          { criterionId: 'plain', rating: 'PARTLY', comment: 'Say the delay first.' },
          { criterionId: 'invented', rating: 'MET', comment: 'Great grammar!' },
          { criterionId: 'hook', rating: 'MET', comment: 'Good question to open.', score: 10 },
          { criterionId: 'hook', rating: 'NOT_YET', comment: 'A duplicate is ignored.' },
        ],
        summary: 'Solid start.',
        grade: 'A+',
      } as never,
      rubric,
      'mock',
      now,
    );
    expect(feedback).toEqual({
      generatedBy: 'AI',
      status: 'READY',
      provider: 'mock',
      criteria: [
        {
          criterionId: 'hook',
          label: 'Hooks attention',
          rating: 'MET',
          comment: 'Good question to open.',
        },
        {
          criterionId: 'plain',
          label: 'States the news plainly',
          rating: 'PARTLY',
          comment: 'Say the delay first.',
        },
      ],
      summary: 'Solid start.',
      notice: FEEDBACK_NOTICE,
      generatedAt: now.toISOString(),
    });
    // No score or grade ever leaves the bound.
    expect(JSON.stringify(feedback)).not.toMatch(/"score"|"grade"|A\+|Great grammar/);
  });

  it('drops unknown ratings and clips long comments', () => {
    const feedback = boundFeedback(
      {
        criteria: [
          { criterionId: 'hook', rating: '9/10', comment: 'x' },
          { criterionId: 'plain', rating: 'MET', comment: 'y'.repeat(1000) },
        ],
      },
      rubric,
      'mock',
      now,
    );
    expect(feedback.criteria.map((c) => c.criterionId)).toEqual(['plain']);
    expect(feedback.criteria[0]!.comment.length).toBeLessThanOrEqual(400);
  });

  it('reports feedback as unavailable when nothing fits the rubric', () => {
    const feedback = boundFeedback({ criteria: 'not a list', summary: 'Hi' }, rubric, 'mock', now);
    expect(feedback).toMatchObject({ status: 'UNAVAILABLE', criteria: [], summary: null });
    expect(unavailableFeedback('mock', now)).toMatchObject({
      generatedBy: 'AI',
      status: 'UNAVAILABLE',
    });
  });
});

describe('MockWritingFeedbackProvider', () => {
  const provider = new MockWritingFeedbackProvider();

  it('rates every criterion and says it is a practice check', async () => {
    const raw = await provider.evaluate({
      prompt: 'Open a talk.',
      rubric,
      answer: 'A surprising fact: the project is three weeks late.',
    });
    const feedback = boundFeedback(raw, rubric, provider.name, now);
    expect(feedback.criteria.map((c) => [c.criterionId, c.rating])).toEqual([
      ['hook', 'MET'],
      ['plain', 'PARTLY'],
    ]);
    expect(feedback.summary).toMatch(/practice check/i);
  });

  it('says when an answer is too short to judge', async () => {
    const raw = await provider.evaluate({ prompt: '', rubric, answer: 'Too short.' });
    const feedback = boundFeedback(raw, rubric, provider.name, now);
    expect(feedback.criteria.every((c) => c.rating === 'NOT_YET')).toBe(true);
    expect(feedback.summary).toMatch(/at least 5 words/);
  });
});
