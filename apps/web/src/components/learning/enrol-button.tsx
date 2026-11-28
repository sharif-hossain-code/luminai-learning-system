'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api-client';

/** Enrols the learner, then opens the first lesson. Enrolling twice is harmless (the API is idempotent). */
export function EnrolButton({ courseId, slug }: { courseId: string; slug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enrol() {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/courses/${courseId}/enrollments`, { method: 'POST' });
      router.push(`/learn/${slug}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'We could not enrol you. Please try again.',
      );
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={enrol} loading={pending} block>
        Enrol and start
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </>
  );
}
