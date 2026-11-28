import {
  FEEDBACK_RATINGS,
  type AiFeedback,
  type FeedbackRating,
  type SnapshotQuestion,
} from '@luminai/contracts';

/**
 * Rubric-based feedback on writing answers.
 *
 * A provider writes feedback; `boundFeedback` then keeps only what the rubric
 * allows (one rating and a short comment per rubric criterion, an optional short
 * summary, never a score) and marks it as AI-generated. Whatever a provider
 * returns, learners only ever see the bounded shape.
 *
 * Until an AI provider is chosen (assumption A6) the mock provider below is used.
 * It is deterministic and says plainly that it is a practice check.
 */

export type Rubric = SnapshotQuestion['rubric'];

export interface FeedbackRequest {
  prompt: string;
  rubric: Rubric;
  answer: string;
}

/** What a provider may return. Treated as untrusted: it is bounded before anyone sees it. */
export interface RawFeedback {
  criteria?: unknown;
  summary?: unknown;
}

export interface WritingFeedbackProvider {
  readonly name: string;
  evaluate(request: FeedbackRequest, signal: AbortSignal): Promise<RawFeedback>;
}

export const WRITING_FEEDBACK_PROVIDER = Symbol('WRITING_FEEDBACK_PROVIDER');

export const FEEDBACK_NOTICE =
  "AI-generated against this question's rubric only. It can be wrong: use it as a guide, not a grade.";

const MAX_COMMENT = 400;
const MAX_SUMMARY = 600;

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const clean = value
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- strip control characters from provider text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const isRating = (value: unknown): value is FeedbackRating =>
  typeof value === 'string' && (FEEDBACK_RATINGS as readonly string[]).includes(value);

/**
 * Keeps the provider's feedback inside the rubric: rubric criteria only, in rubric
 * order, at most once each, with a known rating and a clipped comment. Anything
 * else (invented criteria, scores, grades, extra fields) is dropped.
 */
export function boundFeedback(
  raw: RawFeedback,
  rubric: Rubric,
  provider: string,
  now: Date,
): AiFeedback {
  const entries = Array.isArray(raw.criteria) ? (raw.criteria as unknown[]) : [];
  const byId = new Map<string, { rating: FeedbackRating; comment: string }>();
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { criterionId, rating, comment } = entry as Record<string, unknown>;
    if (typeof criterionId !== 'string' || byId.has(criterionId) || !isRating(rating)) continue;
    byId.set(criterionId, { rating, comment: clip(comment, MAX_COMMENT) });
  }
  const criteria = rubric.criteria.flatMap((criterion) => {
    const found = byId.get(criterion.id);
    return found ? [{ criterionId: criterion.id, label: criterion.label, ...found }] : [];
  });
  const summary = clip(raw.summary, MAX_SUMMARY);
  return {
    generatedBy: 'AI',
    status: criteria.length ? 'READY' : 'UNAVAILABLE',
    provider,
    criteria,
    summary: criteria.length && summary ? summary : null,
    notice: FEEDBACK_NOTICE,
    generatedAt: now.toISOString(),
  };
}

/** Feedback to store when the provider failed or timed out. */
export function unavailableFeedback(provider: string, now: Date): AiFeedback {
  return {
    generatedBy: 'AI',
    status: 'UNAVAILABLE',
    provider,
    criteria: [],
    summary: null,
    notice: FEEDBACK_NOTICE,
    generatedAt: now.toISOString(),
  };
}

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const STOP_WORDS = new Set(
  'the and for with that this from your you are was were have has into what when then than them they their there about which would could should will shall a an of to in on at by is it or as be'.split(
    ' ',
  ),
);

function keywords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => word.length >= 4 && !STOP_WORDS.has(word),
  );
}

/**
 * A deterministic stand-in for an AI model, used until a provider is chosen. It
 * checks the word limits and whether the answer touches each criterion's key
 * words, and phrases every comment as a self-check against the rubric.
 */
export class MockWritingFeedbackProvider implements WritingFeedbackProvider {
  readonly name = 'mock';

  evaluate({ rubric, answer }: FeedbackRequest): Promise<RawFeedback> {
    const words = wordCount(answer);
    const tooShort = rubric.minWords !== null && words < rubric.minWords;
    const tooLong = rubric.maxWords !== null && words > rubric.maxWords;
    const answerWords = new Set(keywords(answer));
    const criteria = rubric.criteria.map((criterion) => {
      const target = criterion.description || criterion.label;
      const touches = keywords(`${criterion.label} ${criterion.description}`).some((word) =>
        answerWords.has(word),
      );
      const rating: FeedbackRating = tooShort ? 'NOT_YET' : touches ? 'MET' : 'PARTLY';
      const comment =
        rating === 'MET'
          ? `Your answer seems to address this. Check it once more against: ${target}`
          : rating === 'PARTLY'
            ? `It isn't clear your answer covers this yet. Look again at: ${target}`
            : `Your answer is shorter than the ${rubric.minWords} words asked for, so this can't be judged yet.`;
      return { criterionId: criterion.id, rating, comment };
    });
    const length = tooShort
      ? `Aim for at least ${rubric.minWords} words (you wrote ${words}).`
      : tooLong
        ? `Aim for at most ${rubric.maxWords} words (you wrote ${words}).`
        : `You wrote ${words} words.`;
    return Promise.resolve({
      criteria,
      summary: `Practice check from the built-in checker, not a full AI review. ${length}`,
    });
  }
}
