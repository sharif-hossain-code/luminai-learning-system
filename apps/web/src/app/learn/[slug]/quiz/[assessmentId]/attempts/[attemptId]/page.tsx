import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AttemptPlayer } from '@/components/assessments/attempt-player';
import { PlayerFrame, PlayerLoading } from '@/components/learning/player-frame';
import { quizPlace } from '@/lib/assessment-format';
import { attemptHref, getAssessment, getAttempt, getLearnerCourse } from '@/lib/learning';

type Params = Promise<{ slug: string; assessmentId: string; attemptId: string }>;

export const metadata: Metadata = { title: 'Quiz attempt' };

async function AttemptView({ params }: { params: Params }) {
  const { slug, assessmentId, attemptId } = await params;
  const [courseAccess, attempt, access] = await Promise.all([
    getLearnerCourse(slug),
    getAttempt(attemptId),
    getAssessment(assessmentId),
  ]);
  if (!courseAccess || !attempt) notFound();
  if (courseAccess.state === 'not-enrolled') redirect(`/courses/${slug}`);
  const { course } = courseAccess;
  if (attempt.course.id !== course.id || attempt.assessmentId !== assessmentId) {
    redirect(attemptHref(attempt.course.slug, attempt.assessmentId, attempt.id));
  }
  // The start page data (attempts left, next step). A quiz removed by a later
  // version still shows its past attempts.
  const assessment = access?.state === 'open' ? access.assessment : null;

  return (
    <PlayerFrame
      course={course}
      currentId={assessmentId}
      place={`${quizPlace(attempt.module)} · Attempt ${attempt.attemptNumber}`}
    >
      <AttemptPlayer
        initial={attempt}
        assessment={assessment}
        courseCompleted={course.enrollment.status === 'COMPLETED'}
      />
    </PlayerFrame>
  );
}

export default function AttemptPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PlayerLoading label="Loading quiz…" />}>
      <AttemptView params={params} />
    </Suspense>
  );
}
