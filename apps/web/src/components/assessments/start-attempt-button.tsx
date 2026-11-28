'use client';

import { attemptSchema } from '@luminai/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api-client';
import { attemptHref } from '@/lib/learning-links';

/**
 * Starts an attempt (or reopens the one in progress: the API returns it instead of
 * opening a second) and goes to it.
 */
export function StartAttemptButton({
  assessmentId,
  courseSlug,
  label,
  variant = 'primary',
}: {
  assessmentId: string;
  courseSlug: string;
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const attempt = attemptSchema.parse(
        await apiFetch(`/assessments/${assessmentId}/attempts`, { method: 'POST' }),
      );
      router.push(attemptHref(courseSlug, assessmentId, attempt.id));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "The quiz didn't open. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={start} loading={pending} variant={variant}>
        {label}
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
