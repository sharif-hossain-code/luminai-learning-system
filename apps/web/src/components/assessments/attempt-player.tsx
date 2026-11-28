'use client';

import type { Attempt, LearnerAssessment } from '@luminai/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AttemptForm } from './attempt-form';
import { AttemptResultView } from './attempt-result';

/** An attempt: the form while it is open, then the result. */
export function AttemptPlayer({
  initial,
  assessment,
  courseCompleted,
}: {
  initial: Attempt;
  assessment: LearnerAssessment | null;
  courseCompleted: boolean;
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(initial);
  // Fresh server data (after the refresh below) wins once it shows the submission.
  const current = initial.status === 'SUBMITTED' ? initial : attempt;

  if (current.status === 'SUBMITTED' && current.result) {
    return (
      <AttemptResultView
        attempt={current}
        assessment={assessment}
        courseCompleted={courseCompleted}
      />
    );
  }
  return (
    <AttemptForm
      attempt={current}
      onSubmitted={(submitted) => {
        setAttempt(submitted);
        window.scrollTo({ top: 0 });
        // Refresh the outline, course progress and attempts left.
        router.refresh();
      }}
    />
  );
}
