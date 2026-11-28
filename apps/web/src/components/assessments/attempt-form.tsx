'use client';

import {
  attemptSchema,
  type AnswerResponse,
  type Attempt,
  type LearnerQuestion,
} from '@luminai/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { plural, quizPlace, wordCount } from '@/lib/assessment-format';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const isAnswered = (response: AnswerResponse | undefined) =>
  response !== undefined &&
  ('optionIds' in response ? response.optionIds.length > 0 : response.text.trim() !== '');

/** How long to wait after typing stops before saving a text answer. */
const TEXT_SAVE_DELAY_MS = 900;

function ChoiceOption({
  type,
  name,
  checked,
  onChange,
  children,
  disabled,
}: {
  type: 'radio' | 'checkbox';
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: string;
  disabled: boolean;
}) {
  return (
    <label
      className={cn(
        'flex min-h-12 cursor-pointer items-start gap-3 rounded-md border bg-surface px-4 py-3 text-body transition-colors',
        checked
          ? 'border-primary bg-primary-subtle/50 shadow-[inset_0_0_0_1px_var(--brand-primary)]'
          : 'border-input hover:bg-hover',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--brand-primary)]"
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

function QuestionCard({
  question,
  total,
  response,
  onChange,
  onBlur,
  disabled,
  highlight,
}: {
  question: LearnerQuestion;
  total: number;
  response: AnswerResponse | undefined;
  onChange: (response: AnswerResponse, immediate: boolean) => void;
  onBlur: () => void;
  disabled: boolean;
  highlight: boolean;
}) {
  const name = `q-${question.id}`;
  const selected = response && 'optionIds' in response ? response.optionIds : [];
  const text = response && 'text' in response ? response.text : '';
  const meta =
    question.type === 'WRITING' ? 'Writing · feedback only' : plural(question.points, 'point');

  return (
    <fieldset
      id={`question-${question.number}`}
      className={cn(
        'flex scroll-mt-6 flex-col gap-3.5 rounded-lg border bg-surface px-5 py-6 sm:px-7',
        highlight ? 'border-warning' : 'border-subtle',
      )}
    >
      <legend className="float-left mb-1.5 flex w-full flex-col gap-1.5 p-0">
        <span className="text-overline font-semibold tracking-wider text-fg-subtle uppercase">
          Question {question.number} of {total} · {meta}
        </span>
        <span className="text-[1.125rem] leading-7 font-semibold whitespace-pre-line">
          {question.prompt}
        </span>
        {question.type === 'MULTIPLE_CHOICE' ? (
          <span className="text-support text-fg-muted">Choose all that apply.</span>
        ) : null}
      </legend>

      {question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE' ? (
        <div className="flex flex-col gap-2.5">
          {question.options.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <ChoiceOption
                key={option.id}
                type={question.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                name={name}
                checked={checked}
                disabled={disabled}
                onChange={(on) => {
                  const optionIds =
                    question.type === 'SINGLE_CHOICE'
                      ? [option.id]
                      : on
                        ? [...selected, option.id]
                        : selected.filter((id) => id !== option.id);
                  onChange({ optionIds }, true);
                }}
              >
                {option.text}
              </ChoiceOption>
            );
          })}
        </div>
      ) : null}

      {question.type === 'TRUE_FALSE' ? (
        <div className="flex flex-col gap-2.5 sm:flex-row">
          {question.options.map((option) => (
            <div key={option.id} className="flex-1">
              <ChoiceOption
                type="radio"
                name={name}
                checked={selected.includes(option.id)}
                disabled={disabled}
                onChange={() => onChange({ optionIds: [option.id] }, true)}
              >
                {option.text}
              </ChoiceOption>
            </div>
          ))}
        </div>
      ) : null}

      {question.type === 'SHORT_TEXT' ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${name}-text`} className="text-support font-medium">
            Your answer
          </label>
          <input
            id={`${name}-text`}
            className="field-control h-11"
            value={text}
            maxLength={200}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => onChange({ text: event.target.value }, false)}
            onBlur={onBlur}
          />
        </div>
      ) : null}

      {question.type === 'WRITING' ? (
        <div className="flex flex-col gap-3">
          {question.rubric?.criteria.length ? (
            <div className="rounded-md bg-muted px-4 py-3 text-support">
              <p className="font-semibold">What good looks like</p>
              <ul className="mt-1.5 list-disc pl-5">
                {question.rubric.criteria.map((criterion) => (
                  <li key={criterion.id}>
                    {criterion.label}
                    {criterion.description ? (
                      <span className="text-fg-muted"> · {criterion.description}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <label htmlFor={`${name}-text`} className="text-support font-medium">
            Your answer
          </label>
          <textarea
            id={`${name}-text`}
            className="field-control min-h-32 py-2.5 leading-6"
            rows={5}
            value={text}
            maxLength={5000}
            disabled={disabled}
            aria-describedby={`${name}-words`}
            onChange={(event) => onChange({ text: event.target.value }, false)}
            onBlur={onBlur}
          />
          <div
            id={`${name}-words`}
            className="flex flex-wrap justify-between gap-2 text-caption text-fg-muted"
          >
            <span>
              {plural(wordCount(text), 'word')}
              {question.rubric?.minWords || question.rubric?.maxWords
                ? ` · aim for ${
                    question.rubric.minWords && question.rubric.maxWords
                      ? `${question.rubric.minWords}–${question.rubric.maxWords}`
                      : question.rubric.minWords
                        ? `at least ${question.rubric.minWords}`
                        : `at most ${question.rubric.maxWords}`
                  }`
                : ''}
            </span>
            <span className="text-secondary-strong">
              You&apos;ll get AI feedback on this answer. It isn&apos;t scored.
            </span>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * Taking a quiz (Assessment.dc.html, 3): every question on one page, answers saved
 * as they change, and a sticky bar with the count and Submit. Submitting with
 * unanswered questions asks first; submitting is final for the attempt.
 */
export function AttemptForm({
  attempt,
  onSubmitted,
}: {
  attempt: Attempt;
  onSubmitted: (attempt: Attempt) => void;
}) {
  const [answers, setAnswers] = useState<Map<string, AnswerResponse>>(
    () => new Map(attempt.answers.map((answer) => [answer.questionId, answer.response])),
  );
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // The newest answers, for saves and submit (updated in `change`, so timers never read stale state).
  const latest = useRef(answers);

  const total = attempt.questions.length;
  const answered = attempt.questions.filter((q) => isAnswered(answers.get(q.id))).length;
  const unanswered = attempt.questions.filter((q) => !isAnswered(answers.get(q.id)));

  const persist = useCallback(
    async (questionId: string) => {
      const response = latest.current.get(questionId);
      if (!response) return;
      setSaveState('saving');
      try {
        await apiFetch(`/attempts/${attempt.id}/answers/${questionId}`, {
          method: 'PUT',
          body: { response },
        });
        setSaveState('saved');
      } catch (caught) {
        // A submitted attempt (another tab) can't take answers: the page reloads it.
        if (caught instanceof ApiError && caught.code === 'ATTEMPT_SUBMITTED') {
          window.location.reload();
          return;
        }
        setSaveState('error');
      }
    },
    [attempt.id],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  function change(questionId: string, response: AnswerResponse, immediate: boolean) {
    setAnswers((current) => new Map(current).set(questionId, response));
    latest.current = new Map(latest.current).set(questionId, response);
    setConfirming(false);
    const pending = timers.current.get(questionId);
    if (pending) clearTimeout(pending);
    if (immediate) void persist(questionId);
    else {
      timers.current.set(
        questionId,
        setTimeout(() => {
          timers.current.delete(questionId);
          void persist(questionId);
        }, TEXT_SAVE_DELAY_MS),
      );
    }
  }

  function flush(questionId: string) {
    const pending = timers.current.get(questionId);
    if (!pending) return;
    clearTimeout(pending);
    timers.current.delete(questionId);
    void persist(questionId);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    try {
      const result = attemptSchema.parse(
        await apiFetch(`/attempts/${attempt.id}/submit`, {
          method: 'POST',
          body: {
            answers: [...latest.current].map(([questionId, response]) => ({
              questionId,
              response,
            })),
          },
        }),
      );
      onSubmitted(result);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'ATTEMPT_SUBMITTED') {
        window.location.reload();
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Your answers weren't submitted. Check your connection and try again.",
      );
      setSubmitting(false);
      setConfirming(false);
    }
  }

  const status =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Not saved. Your answers are kept here; submitting sends them all.'
          : null;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-overline font-semibold tracking-wider text-warning-text uppercase">
            {quizPlace(attempt.module)} · attempt {attempt.attemptNumber}
            {attempt.maxAttempts ? ` of ${attempt.maxAttempts}` : ''}
          </p>
          <h1 className="mt-1.5 text-[1.625rem] leading-[2.125rem] font-semibold">
            {attempt.title}
          </h1>
        </div>
        <span className="text-support text-fg-muted">Pass mark {attempt.passPercent}%</span>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (unanswered.length && !confirming) setConfirming(true);
          else void submit();
        }}
        className="flex flex-col gap-4"
      >
        {attempt.questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            total={total}
            response={answers.get(question.id)}
            disabled={submitting}
            highlight={confirming && !isAnswered(answers.get(question.id))}
            onChange={(response, immediate) => change(question.id, response, immediate)}
            onBlur={() => flush(question.id)}
          />
        ))}

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-3 rounded-lg border border-subtle bg-surface/95 px-5 py-3.5 shadow-[0_-6px_24px_rgba(15,23,42,0.06)] backdrop-blur">
          {confirming ? (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-md bg-warning-subtle px-4 py-3 text-warning-text"
            >
              <p className="text-support">
                <strong className="font-semibold">
                  {unanswered.length === 1
                    ? '1 question has no answer.'
                    : `${unanswered.length} questions have no answer.`}
                </strong>{' '}
                Unanswered questions score zero, and submitting is final for this attempt.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={submitting}>
                  Submit anyway
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setConfirming(false);
                    const first = unanswered[0];
                    if (first) {
                      document.getElementById(`question-${first.number}`)?.scrollIntoView();
                      document
                        .querySelector<HTMLElement>(
                          `#question-${first.number} input, #question-${first.number} textarea`,
                        )
                        ?.focus();
                    }
                  }}
                >
                  Go to question {unanswered[0]?.number}
                </Button>
              </div>
            </div>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex flex-wrap items-center gap-3.5">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <p className="text-support" aria-live="polite">
                <strong className="font-semibold">
                  {answered} of {total} answered
                </strong>
                {status ? (
                  <span className={saveState === 'error' ? 'text-danger-text' : 'text-fg-muted'}>
                    {' '}
                    · {status}
                  </span>
                ) : null}
              </p>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-subtle">
                <span
                  className="block h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                  style={{ width: `${total ? Math.round((answered * 100) / total) : 0}%` }}
                />
              </div>
            </div>
            {!confirming ? (
              <Button type="submit" loading={submitting}>
                Submit answers
              </Button>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
