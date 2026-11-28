import type { FeedbackMode, FeedbackRating, QuestionType } from '@luminai/contracts';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTIPLE_CHOICE: 'Multiple select',
  TRUE_FALSE: 'True or false',
  SHORT_TEXT: 'Short answer',
  WRITING: 'Writing',
};

export const FEEDBACK_MODE_LABELS: Record<FeedbackMode, string> = {
  SCORE_ONLY: 'The score only',
  CORRECTNESS: 'Which answers were right or wrong',
  FULL: 'Answers and explanations',
};

export const RATING_LABELS: Record<FeedbackRating, string> = {
  MET: 'Met',
  PARTLY: 'Partly',
  NOT_YET: 'Not yet',
};

/** "Module 2 quiz" or "Final assessment": where a quiz sits in the course. */
export function quizPlace(module: { number: number } | null): string {
  return module ? `Module ${module.number} quiz` : 'Final assessment';
}

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export const plural = (count: number, word: string, many = `${word}s`) =>
  `${count} ${count === 1 ? word : many}`;

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
