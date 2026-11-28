import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { QuizIntro } from '@/components/assessments/quiz-intro';
import { LockedStep, PlayerFrame, PlayerLoading } from '@/components/learning/player-frame';
import { quizPlace } from '@/lib/assessment-format';
import { assessmentHref, getAssessment, getLearnerCourse } from '@/lib/learning';

type Params = Promise<{ slug: string; assessmentId: string }>;

export const metadata: Metadata = { title: 'Quiz' };

async function QuizStart({ params }: { params: Params }) {
  const { slug, assessmentId } = await params;
  const [courseAccess, access] = await Promise.all([
    getLearnerCourse(slug),
    getAssessment(assessmentId),
  ]);
  if (!courseAccess || !access) notFound();
  if (courseAccess.state === 'not-enrolled' || access.state === 'not-enrolled') {
    redirect(`/courses/${slug}`);
  }
  const { course } = courseAccess;
  if (access.state === 'open' && access.assessment.course.id !== course.id) {
    redirect(assessmentHref(access.assessment.course.slug, assessmentId));
  }
  const inModule = course.modules.find((m) => m.assessments.some((a) => a.id === assessmentId));
  const isFinal = course.finalAssessments.some((a) => a.id === assessmentId);
  if (!inModule && !isFinal) notFound();
  const place = quizPlace(inModule ? { number: course.modules.indexOf(inModule) + 1 } : null);

  return (
    <PlayerFrame course={course} currentId={assessmentId} place={place}>
      {access.state === 'locked' ? (
        <LockedStep course={course} kind="quiz" />
      ) : (
        <QuizIntro assessment={access.assessment} />
      )}
    </PlayerFrame>
  );
}

export default function QuizPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PlayerLoading label="Loading quiz…" />}>
      <QuizStart params={params} />
    </Suspense>
  );
}
