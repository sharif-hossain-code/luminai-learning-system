'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api-client';
import { formatCountdown, useCooldown } from '@/lib/use-cooldown';

const COOLDOWN_SECONDS = 60;

/**
 * "Resend email" with the countdown shown on the button itself, matching the API's
 * one-per-minute limit. Starts in cooldown because an email was just sent.
 */
export function ResendButton({
  path,
  email,
  label = 'Resend email',
}: {
  path: '/auth/resend-verification' | '/auth/forgot-password';
  email: string;
  label?: string;
}) {
  const cooldown = useCooldown();
  const { start } = cooldown;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => start(COOLDOWN_SECONDS), [start]);

  async function resend() {
    setError(null);
    setSent(false);
    setSending(true);
    try {
      await apiFetch(path, { method: 'POST', body: { email } });
      setSent(true);
      start(COOLDOWN_SECONDS);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) {
        start(caught.retryAfterSeconds ?? COOLDOWN_SECONDS);
      } else {
        setError(
          caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
        );
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {sent ? <Alert tone="success">New email sent. It can take a minute to arrive.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        variant="secondary"
        size="lg"
        block
        onClick={resend}
        disabled={cooldown.active}
        loading={sending}
      >
        {cooldown.active ? `Resend in ${formatCountdown(cooldown.remaining)}` : label}
      </Button>
      {cooldown.active && !sent ? (
        <p className="text-center text-caption text-fg-muted">
          You can request a new email once a minute.
        </p>
      ) : null}
    </div>
  );
}
