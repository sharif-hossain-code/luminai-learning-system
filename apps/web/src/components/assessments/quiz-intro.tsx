import type { LearnerAssessment } from '@luminai/contracts';
import Link from 'next/link';
import { Alert, Pill } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { formatDate, plural, quizPlace } from '@/lib/assessment-format';
import { formatDuration } from '@/lib/course-format';
import { attemptHref, stepHref } from '@/lib/learning-links';
import { StartAttemptButton } from './start-attempt-button';

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-[120px] flex-1 flex-col gap-0.5 rounded-md bg-muted px-3.5 py-3">
      <dd className="order-1 text-[1.0625rem] font-semibold">{value}</dd>
      <dt className="order-2 text-caption text-fg-muted">{label}</dt>
    </div>
  );
}

/** Text with paragraph breaks, rendered as plain text (never markup). */
export function Paragraphs({ text, className }: { text: string; className?: string }) {
  return text
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph, index) => (
      <p key={index} className={className}>
        {paragraph}
      </p>
    ));
}

/** The quiz start page (Assessment.dc.html, 2). */
export function QuizIntro({ assessment }: { assessment: LearnerAssessment }) {
  const slug = assessment.course.slug;
  const { openAttempt, attemptsLeft, passed } = assessment;
  const outOfAttempts = !passed && attemptsLeft === 0 && !openAttempt;
  const nextNumber = assessment.attemptsUsed + 1;
  const latest = assessment.attempts[0];
  const next = assessment.next && !assessment.next.locked ? assessment.next : null;

  return (
    <article className="flex flex-col gap-5 rounded-lg border border-subtle bg-surface px-5 py-7 sm:px-10 sm:py-8">
      <p className="text-overline font-semibold tracking-wider text-warning-text uppercase">
        {quizPlace(assessment.module)} · about {formatDuration(assessment.estimatedMinutes)}
        {assessment.isRequired ? '' : ' · Optional'}
      </p>
      <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold">{assessment.title}</h1>

      {passed ? (
        <Alert tone="success">
          <strong>Passed with {assessment.bestPercent}%.</strong>{' '}
          {attemptsLeft !== 0
            ? 'You can try again to practise; your best result counts.'
            : 'Well done.'}
        </Alert>
      ) : outOfAttempts ? (
        <Alert tone="warning">
          You&apos;ve used all {plural(assessment.maxAttempts ?? 0, 'attempt')}. Your best result
          was {assessment.bestPercent ?? 0}%; the pass mark is {assessment.passPercent}%. Contact
          the course team if you need another try.
        </Alert>
      ) : null}

      {assessment.instructions ? (
        <div className="flex max-w-[68ch] flex-col gap-3 text-[1.0625rem] leading-7">
          <Paragraphs text={assessment.instructions} />
        </div>
      ) : null}

      <dl className="flex flex-wrap gap-2.5">
        <Fact
          value={String(assessment.questionCount)}
          label={`${assessment.questionCount === 1 ? 'question' : 'questions'} · ${plural(assessment.maxScore, 'point')}`}
        />
        <Fact value={`${assessment.passPercent}%`} label="to pass" />
        <Fact
          value={
            attemptsLeft === null ? 'Unlimited' : `${attemptsLeft} of ${assessment.maxAttempts}`
          }
          label={attemptsLeft === null ? 'attempts' : 'attempts left'}
        />
      </dl>

      {assessment.attempts.length ? (
        <section aria-labelledby="attempts-heading" className="flex flex-col gap-2">
          <h2 id="attempts-heading" className="text-body font-semibold">
            Your attempts
          </h2>
          <ul className="flex flex-col gap-2">
            {assessment.attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-subtle px-3.5 py-3 text-support"
              >
                <span>
                  <strong className="font-semibold">Attempt {attempt.attemptNumber}</strong>
                  {attempt.submittedAt ? (
                    <span className="text-fg-muted"> · {formatDate(attempt.submittedAt)}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2.5">
                  <span>{attempt.percent}%</span>
                  <Pill tone={attempt.passed ? 'success' : 'danger'}>
                    {attempt.passed ? 'Passed' : 'Not passed'}
                  </Pill>
                  <Link
                    href={attemptHref(slug, assessment.id, attempt.id)}
                    className="rounded-sm font-semibold text-primary hover:text-primary-hover"
                  >
                    Review<span className="sr-only"> attempt {attempt.attemptNumber}</span>
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-support text-fg-muted">
        Your answers save as you go, so you can finish on another device.
      </p>

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-subtle pt-5">
        {assessment.previous ? (
          <ButtonLink href={stepHref(slug, assessment.previous)} variant="secondary">
            {assessment.previous.kind === 'ASSESSMENT' ? 'Previous quiz' : 'Previous lesson'}
          </ButtonLink>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-3">
          {passed && next ? (
            <ButtonLink href={stepHref(slug, next)} variant={openAttempt ? 'secondary' : 'primary'}>
              {next.kind === 'ASSESSMENT' ? 'Next quiz' : 'Next lesson'}
            </ButtonLink>
          ) : null}
          {openAttempt ? (
            <ButtonLink href={attemptHref(slug, assessment.id, openAttempt.id)}>
              Resume attempt {openAttempt.attemptNumber}
              <span className="font-normal opacity-90">
                · {openAttempt.answeredCount} of {assessment.questionCount} answered
              </span>
            </ButtonLink>
          ) : outOfAttempts ? (
            latest ? (
              <ButtonLink href={attemptHref(slug, assessment.id, latest.id)} variant="secondary">
                Review answers
              </ButtonLink>
            ) : null
          ) : (
            <StartAttemptButton
              assessmentId={assessment.id}
              courseSlug={slug}
              variant={passed && next ? 'secondary' : 'primary'}
              label={
                passed
                  ? 'Try again'
                  : assessment.attemptsUsed
                    ? `Start attempt ${nextNumber}`
                    : 'Start the quiz'
              }
            />
          )}
        </div>
      </div>
    </article>
  );
}
