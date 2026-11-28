import { randomUUID } from 'node:crypto';
import type { AnswerResponse, QuestionType, SnapshotQuestion } from '@luminai/contracts';
import { describe, expect, it } from 'vitest';
import {
  gradeAttempt,
  gradeQuestion,
  isAnswered,
  normalizeShortAnswer,
  responseFitsQuestion,
} from './grading.js';

function question(type: QuestionType, overrides: Partial<SnapshotQuestion> = {}): SnapshotQuestion {
  const choice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
  return {
    id: randomUUID(),
    type,
    prompt: 'Question',
    options:
      type === 'TRUE_FALSE'
        ? [
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ]
        : choice
          ? [
              { id: 'a', text: 'A' },
              { id: 'b', text: 'B' },
              { id: 'c', text: 'C' },
            ]
          : [],
    answerKey: {},
    explanation: '',
    rubric: { criteria: [], minWords: null, maxWords: null },
    points: type === 'WRITING' ? 0 : 1,
    ...overrides,
  };
}

const pick = (...optionIds: string[]): AnswerResponse => ({ optionIds });
const text = (value: string): AnswerResponse => ({ text: value });

describe('gradeQuestion', () => {
  it('scores single choice only for the correct option', () => {
    const q = question('SINGLE_CHOICE', { answerKey: { correctOptionIds: ['b'] }, points: 2 });
    expect(gradeQuestion(q, pick('b'))).toEqual({ questionId: q.id, correct: true, points: 2 });
    expect(gradeQuestion(q, pick('a')).correct).toBe(false);
    expect(gradeQuestion(q, pick()).correct).toBe(false);
    expect(gradeQuestion(q, undefined)).toMatchObject({ correct: false, points: 0 });
    // Two options for a single-choice question is never right, even if one is correct.
    expect(gradeQuestion(q, pick('a', 'b')).correct).toBe(false);
  });

  it('needs exactly the correct options for multiple select (no partial credit)', () => {
    const q = question('MULTIPLE_CHOICE', { answerKey: { correctOptionIds: ['a', 'c'] } });
    expect(gradeQuestion(q, pick('c', 'a')).correct).toBe(true);
    expect(gradeQuestion(q, pick('a')).correct).toBe(false);
    expect(gradeQuestion(q, pick('a', 'b', 'c')).correct).toBe(false);
  });

  it('scores true/false', () => {
    const q = question('TRUE_FALSE', { answerKey: { correctOptionIds: ['false'] } });
    expect(gradeQuestion(q, pick('false')).correct).toBe(true);
    expect(gradeQuestion(q, pick('true')).correct).toBe(false);
  });

  it('matches short answers ignoring case, spacing and end punctuation', () => {
    const q = question('SHORT_TEXT', {
      answerKey: { acceptedAnswers: ['rule of three', 'Tricolon'] },
    });
    expect(gradeQuestion(q, text('  Rule   of THREE. ')).correct).toBe(true);
    expect(gradeQuestion(q, text('“tricolon”!')).correct).toBe(true);
    expect(gradeQuestion(q, text('rule of two')).correct).toBe(false);
    expect(gradeQuestion(q, text('')).correct).toBe(false);
  });

  it('treats a response of the wrong shape as wrong', () => {
    const q = question('SINGLE_CHOICE', { answerKey: { correctOptionIds: ['a'] } });
    expect(gradeQuestion(q, text('a')).correct).toBe(false);
    expect(gradeQuestion(q, pick('zzz')).correct).toBe(false);
  });

  it('never scores writing questions', () => {
    const q = question('WRITING');
    expect(gradeQuestion(q, text('A thoughtful answer'))).toEqual({
      questionId: q.id,
      correct: null,
      points: 0,
    });
  });

  it('never marks a choice question right when it has no answer key', () => {
    const q = question('SINGLE_CHOICE');
    expect(gradeQuestion(q, pick()).correct).toBe(false);
  });
});

describe('gradeAttempt', () => {
  const questions = [
    question('SINGLE_CHOICE', { answerKey: { correctOptionIds: ['a'] }, points: 2 }),
    question('MULTIPLE_CHOICE', { answerKey: { correctOptionIds: ['a', 'b'] } }),
    question('TRUE_FALSE', { answerKey: { correctOptionIds: ['true'] } }),
    question('SHORT_TEXT', { answerKey: { acceptedAnswers: ['signpost'] } }),
    question('WRITING'),
  ];
  const [single, multiple, trueFalse, short, writing] = questions;

  it('adds up points across question types, excluding writing from the maximum', () => {
    const responses = new Map<string, AnswerResponse>([
      [single!.id, pick('a')],
      [multiple!.id, pick('a')],
      [trueFalse!.id, pick('true')],
      [short!.id, text('Signpost')],
      [writing!.id, text('Some writing')],
    ]);
    const grade = gradeAttempt(questions, responses, 70);
    expect(grade).toMatchObject({ score: 4, maxScore: 5, percent: 80, passed: true });
    expect(grade.questions.map((q) => q.correct)).toEqual([true, false, true, true, null]);
  });

  it('fails below the pass mark and rounds the percentage down', () => {
    const responses = new Map<string, AnswerResponse>([[single!.id, pick('a')]]);
    expect(gradeAttempt(questions, responses, 70)).toMatchObject({
      score: 2,
      maxScore: 5,
      percent: 40,
      passed: false,
    });
    const thirds = [question('TRUE_FALSE', { answerKey: { correctOptionIds: ['true'] } })];
    thirds.push(question('TRUE_FALSE'), question('TRUE_FALSE'));
    expect(gradeAttempt(thirds, new Map([[thirds[0]!.id, pick('true')]]), 34).percent).toBe(33);
  });

  it('passes an assessment with nothing to score', () => {
    expect(gradeAttempt([writing!], new Map(), 70)).toMatchObject({
      score: 0,
      maxScore: 0,
      percent: 100,
      passed: true,
    });
  });

  it('passes exactly at the pass mark', () => {
    const responses = new Map<string, AnswerResponse>([
      [single!.id, pick('a')],
      [trueFalse!.id, pick('true')],
      [short!.id, text('signpost')],
      [multiple!.id, pick('b', 'a')],
    ]);
    expect(gradeAttempt(questions, responses, 100).passed).toBe(true);
  });
});

describe('response checks', () => {
  it('checks the response shape against the question', () => {
    const single = question('SINGLE_CHOICE');
    expect(responseFitsQuestion(single, pick('a'))).toBe(true);
    expect(responseFitsQuestion(single, pick('a', 'b'))).toBe(false);
    expect(responseFitsQuestion(single, pick('x'))).toBe(false);
    expect(responseFitsQuestion(single, text('a'))).toBe(false);
    expect(responseFitsQuestion(question('SHORT_TEXT'), text('x'.repeat(201)))).toBe(false);
    expect(responseFitsQuestion(question('WRITING'), text('x'.repeat(2000)))).toBe(true);
  });

  it('treats blank responses as unanswered', () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered(pick())).toBe(false);
    expect(isAnswered(text('   '))).toBe(false);
    expect(isAnswered(text('yes'))).toBe(true);
  });

  it('normalises short answers', () => {
    expect(normalizeShortAnswer('  The   Rule of Three!! ')).toBe('the rule of three');
    expect(normalizeShortAnswer('Café')).toBe(normalizeShortAnswer('Café'));
  });
});
