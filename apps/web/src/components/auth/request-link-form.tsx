'use client';

import { emailOnlyRequestSchema } from '@luminai/contracts';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/api-client';

/**
 * Email field that asks the API for a fresh link. The API answers the same way
 * whether or not the address exists, and so does this form.
 */
export function RequestLinkForm({
  path,
  submitLabel,
  onSent,
  autoFocus = false,
}: {
  path: '/auth/resend-verification' | '/auth/forgot-password';
  submitLabel: string;
  onSent: (email: string) => void;
  autoFocus?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = emailOnlyRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError('Enter a full email address, like name@example.com.');
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      await apiFetch(path, { method: 'POST', body: parsed.data });
      onSent(parsed.data.email);
    } catch (caught) {
      // A 429 still means a link went out recently, so show the same confirmation.
      if (caught instanceof ApiError && caught.status === 429) onSent(parsed.data.email);
      else
        setFormError(
          caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
        );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={error}
        required
        autoFocus={autoFocus}
      />
      <Button type="submit" size="lg" block loading={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
