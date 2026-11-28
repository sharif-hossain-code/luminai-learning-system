import {
  isChoiceType,
  isScoredType,
  QUESTION_LIMITS,
  type AnswerResponse,
  type SnapshotQuestion,
} from '@luminai/contracts';

/**
 * Pure scoring rules (unit-tested in grading.spec.ts). No partial credit: a
 * question earns its points only when the answer is fully right.
 *
 * - Single choice and true/false: the one correct option is selected.
 * - Multiple select: exactly the correct options are selected, no more, no fewer.
 * - Short answer: matches an accepted answer, ignoring capitals, accents in
 *   composed/decomposed form, repeated spaces and surrounding punctuation.
 * - Writing: not scored (0 points, `correct: null`); it gets rubric feedback.
 */

export interface QuestionGrade {
  questionId: string;
  correct: boolean | null;
  points: number;
}

export interface AttemptGrade {
  score: number;
  maxScore: number;
  /** 0–100, rounded down. 100 when nothing in the assessment is scored. */
  percent: number;
  passed: boolean;
  questions: QuestionGrade[];
}

const EDGE_PUNCTUATION = /^[\s"'“”‘’.,!?;:()[\]«»¿¡…-]+|[\s"'“”‘’.,!?;:()[\]«»¿¡…-]+$/gu;

/** How short answers are compared: "  The Rule of Three! " → "the rule of three". */
export function normalizeShortAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCTUATION, '')
    .trim();
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** True when the response has the shape the question type expects (and fits its limits). */
export function responseFitsQuestion(
  question: SnapshotQuestion,
  response: AnswerResponse,
): boolean {
  if (isChoiceType(question.type)) {
    if (!('optionIds' in response)) return false;
    const known = new Set(question.options.map((option) => option.id));
    if (!response.optionIds.every((id) => known.has(id))) return false;
    return question.type === 'MULTIPLE_CHOICE' || response.optionIds.length <= 1;
  }
  if (!('text' in response)) return false;
  return question.type === 'SHORT_TEXT'
    ? response.text.length <= QUESTION_LIMITS.shortTextAnswer
    : response.text.length <= QUESTION_LIMITS.writingAnswer;
}

/** Whether a saved response counts as answered (an empty selection or blank text doesn't). */
export function isAnswered(response: AnswerResponse | undefined): boolean {
  if (!response) return false;
  return 'optionIds' in response ? response.optionIds.length > 0 : response.text.trim() !== '';
}

export function gradeQuestion(
  question: SnapshotQuestion,
  response: AnswerResponse | undefined,
): QuestionGrade {
  if (!isScoredType(question.type)) return { questionId: question.id, correct: null, points: 0 };
  let correct = false;
  if (response && isAnswered(response) && responseFitsQuestion(question, response)) {
    if ('optionIds' in response) {
      const key = question.answerKey.correctOptionIds ?? [];
      correct = key.length > 0 && sameSet(response.optionIds, key);
    } else {
      const given = normalizeShortAnswer(response.text);
      correct = (question.answerKey.acceptedAnswers ?? []).some(
        (accepted) => normalizeShortAnswer(accepted) === given,
      );
    }
  }
  return { questionId: question.id, correct, points: correct ? question.points : 0 };
}

/** The most an attempt can score: the points of the scored questions. */
export function maxScoreOf(questions: readonly SnapshotQuestion[]): number {
  return questions
    .filter((question) => isScoredType(question.type))
    .reduce((sum, question) => sum + question.points, 0);
}

export function gradeAttempt(
  questions: readonly SnapshotQuestion[],
  responses: ReadonlyMap<string, AnswerResponse>,
  passPercent: number,
): AttemptGrade {
  const graded = questions.map((question) => gradeQuestion(question, responses.get(question.id)));
  const score = graded.reduce((sum, grade) => sum + grade.points, 0);
  const maxScore = maxScoreOf(questions);
  const percent = maxScore === 0 ? 100 : Math.floor((score * 100) / maxScore);
  return { score, maxScore, percent, passed: percent >= passPercent, questions: graded };
}
