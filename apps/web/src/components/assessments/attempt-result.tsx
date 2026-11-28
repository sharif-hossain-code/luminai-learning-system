import type {
  AiFeedback,
  Attempt,
  LearnerAssessment,
  LearnerQuestion,
  QuestionResult,
} from '@luminai/contracts';
import { Check, Sparkles, X } from 'lucide-react';
import { Alert, Pill } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { plural, RATING_LABELS } from '@/lib/assessment-format';
import { assessmentHref, stepHref } from '@/lib/learning-links';
import { StartAttemptButton } from './start-attempt-button';

function ScoreRing({ percent, passed }: { percent: number; passed: boolean }) {
  const colour = passed ? 'var(--state-success)' : 'var(--state-danger)';
  return (
    <div
      aria-hidden
      className="flex size-24 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${colour} 0 ${percent}%, var(--border-subtle) ${percent}% 100%)`,
      }}
    >
      <div className="flex size-[76px] items-center justify-center rounded-full bg-surface text-[1.375rem] font-bold">
        {percent}%
      </div>
    </div>
  );
}

function describeResponse(question: LearnerQuestion, attempt: Attempt): string | null {
  const response = attempt.answers.find((a) => a.questionId === question.id)?.response;
  if (!response) return null;
  if ('text' in response) return response.text.trim() || null;
  const texts = question.options
    .filter((option) => response.optionIds.includes(option.id))
    .map((option) => option.text);
  return texts.length ? texts.join(', ') : null;
}

function correctAnswer(question: LearnerQuestion, result: QuestionResult): string | null {
  if (result.correctOptionIds) {
    return question.options
      .filter((option) => result.correctOptionIds!.includes(option.id))
      .map((option) => option.text)
      .join(', ');
  }
  if (result.acceptedAnswers?.length) return result.acceptedAnswers.join(' · ');
  return null;
}

/** Rubric feedback on a writing answer: AI-generated, per criterion, never a score. */
function AiFeedbackPanel({ feedback }: { feedback: AiFeedback }) {
  const ratingTone = { MET: 'success', PARTLY: 'warning', NOT_YET: 'danger' } as const;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-secondary/30 bg-secondary-subtle/60 px-4 py-3.5">
      <p className="flex items-center gap-2 text-caption font-semibold text-secondary-strong">
        <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-white">
          <Sparkles aria-hidden className="size-3.5" />
        </span>
        AI feedback · not scored
      </p>
      {feedback.status === 'READY' ? (
        <ul className="flex flex-col gap-2.5 text-support">
          {feedback.criteria.map((criterion) => (
            <li key={criterion.criterionId} className="flex gap-2.5">
              <span className="shrink-0">
                <Pill tone={ratingTone[criterion.rating]}>{RATING_LABELS[criterion.rating]}</Pill>
              </span>
              <span>
                <strong className="font-semibold">{criterion.label}.</strong> {criterion.comment}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-support">Feedback isn&apos;t available for this answer right now.</p>
      )}
      {feedback.summary ? <p className="text-support">{feedback.summary}</p> : null}
      <p className="text-caption text-secondary-strong">
        {feedback.notice}
        {feedback.provider === 'mock'
          ? ' This is the built-in practice checker; full AI feedback arrives when an AI provider is connected.'
          : ''}
      </p>
    </div>
  );
}

function QuestionReview({
  question,
  result,
  attempt,
}: {
  question: LearnerQuestion;
  result: QuestionResult;
  attempt: Attempt;
}) {
  const given = describeResponse(question, attempt);
  const correct = correctAnswer(question, result);
  const writing = question.type === 'WRITING';
  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border bg-surface px-5 py-5 sm:px-6',
        writing ? 'border-subtle' : result.isCorrect ? 'border-success/40' : 'border-danger/35',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-overline font-semibold tracking-wider text-fg-subtle uppercase">
          Question {question.number}
          {writing
            ? ' · Writing'
            : ` · ${result.awardedPoints} of ${plural(question.points, 'point')}`}
        </span>
        {writing ? null : result.isCorrect ? (
          <Pill tone="success">
            <Check aria-hidden className="mr-1 size-3.5" strokeWidth={3} />
            Correct
          </Pill>
        ) : (
          <Pill tone="danger">
            <X aria-hidden className="mr-1 size-3.5" strokeWidth={3} />
            Not quite
          </Pill>
        )}
      </div>
      <h3 className="text-body font-semibold whitespace-pre-line">{question.prompt}</h3>
      <p className="text-support whitespace-pre-line">
        <span className="text-fg-muted">Your answer: </span>
        {given ?? <em className="text-fg-muted">No answer</em>}
      </p>
      {correct && !result.isCorrect ? (
        <p className="text-support">
          <span className="text-fg-muted">Correct answer: </span>
          {correct}
        </p>
      ) : null}
      {result.explanation ? (
        <p className="rounded-md bg-muted px-3.5 py-3 text-support whitespace-pre-line">
          <strong className="font-semibold">Why: </strong>
          {result.explanation}
        </p>
      ) : null}
      {result.aiFeedback ? <AiFeedbackPanel feedback={result.aiFeedback} /> : null}
    </article>
  );
}

/** Results and review (Assessment.dc.html, 4). */
export function AttemptResultView({
  attempt,
  assessment,
  courseCompleted,
}: {
  attempt: Attempt;
  /** The start page data, for attempts left and the next step. Null if it can't be loaded. */
  assessment: LearnerAssessment | null;
  courseCompleted: boolean;
}) {
  const result = attempt.result!;
  const slug = attempt.course.slug;
  const attemptsLeft = assessment?.attemptsLeft ?? null;
  const canRetry = assessment !== null && attemptsLeft !== 0 && !assessment.openAttempt;
  const next = assessment?.next && !assessment.next.locked ? assessment.next : null;
  const byQuestion = new Map((result.questions ?? []).map((q) => [q.questionId, q]));

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="result-heading"
        className={cn(
          'flex flex-wrap items-center gap-6 rounded-lg border px-6 py-7 sm:px-8',
          result.passed ? 'border-success/40 bg-success-subtle/40' : 'border-danger/35 bg-surface',
        )}
      >
        <ScoreRing percent={result.percent} passed={result.passed} />
        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <p
            className={cn(
              'text-overline font-semibold tracking-wider uppercase',
              result.passed ? 'text-success-text' : 'text-danger-text',
            )}
          >
            {result.passed ? 'Passed' : 'Not passed'}
          </p>
          <h1 id="result-heading" className="text-h1 font-semibold">
            {result.passed ? 'Well done, you passed' : 'Not this time'}
          </h1>
          <p className="text-fg-muted">
            {result.score} of {plural(result.maxScore, 'point')} · {result.percent}% · pass mark{' '}
            {result.passPercent}% · attempt {attempt.attemptNumber}
            {attempt.maxAttempts ? ` of ${attempt.maxAttempts}` : ''}
          </p>
          {!result.passed && attemptsLeft !== null ? (
            <p className="text-support text-fg-muted">
              {attemptsLeft === 0
                ? 'No attempts left.'
                : `${plural(attemptsLeft, 'attempt')} left.`}{' '}
              Review the lessons, then try again.
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-wrap gap-3">
          {result.passed && next ? (
            <ButtonLink href={stepHref(slug, next)}>Continue: {next.title}</ButtonLink>
          ) : null}
          {!result.passed && canRetry ? (
            <StartAttemptButton
              assessmentId={attempt.assessmentId}
              courseSlug={slug}
              label="Try again"
            />
          ) : null}
          {assessment?.previous && !result.passed ? (
            <ButtonLink href={stepHref(slug, assessment.previous)} variant="secondary">
              Review the lessons
            </ButtonLink>
          ) : null}
          <ButtonLink href={assessmentHref(slug, attempt.assessmentId)} variant="secondary">
            Quiz overview
          </ButtonLink>
          {result.passed && !next ? (
            <ButtonLink href={`/courses/${slug}`} variant="secondary">
              Back to course
            </ButtonLink>
          ) : null}
        </div>
      </section>

      {courseCompleted && result.passed ? (
        <Alert tone="success">
          <strong>You finished the course.</strong> All required lessons and quizzes in “
          {attempt.course.title}” are complete.
        </Alert>
      ) : null}

      {result.feedbackMode === 'FULL' && !result.answersRevealed ? (
        <Alert tone="info">
          Correct answers and explanations appear once you pass or have used every attempt.
        </Alert>
      ) : null}

      {result.questions ? (
        <section aria-label="Your answers" className="flex flex-col gap-3">
          {attempt.questions.map((question) => {
            const questionResult = byQuestion.get(question.id);
            return questionResult ? (
              <QuestionReview
                key={question.id}
                question={question}
                result={questionResult}
                attempt={attempt}
              />
            ) : null;
          })}
        </section>
      ) : (
        <p className="text-support text-fg-muted">
          This quiz shows your score only, not the answers.
        </p>
      )}
    </div>
  );
}
