'use client';

import { registerRequestSchema } from '@luminai/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthHeading } from '@/components/auth/auth-heading';
import { AuthTabs } from '@/components/auth/auth-tabs';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox, TextField } from '@/components/ui/field';
import { PasswordRules } from '@/components/ui/password-rules';
import { ApiError, apiFetch } from '@/lib/api-client';
import { zodFieldErrors } from '@/lib/form-errors';

type Fields = 'displayName' | 'email' | 'password' | 'acceptTerms';

export function SignUpForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') ?? undefined;
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = registerRequestSchema.safeParse({
      email,
      password,
      displayName: displayName.trim() || undefined,
      acceptTerms,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors<Fields>(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await apiFetch('/auth/register', { method: 'POST', body: parsed.data });
      router.push(`/check-email?email=${encodeURIComponent(parsed.data.email)}`);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError) {
        const fieldErrors: Partial<Record<Fields, string>> = {};
        for (const field of ['displayName', 'email', 'password', 'acceptTerms'] as const) {
          const message = error.fieldMessage(field);
          if (message) fieldErrors[field] = message;
        }
        setErrors(fieldErrors);
        if (Object.keys(fieldErrors).length === 0) setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    }
  }

  return (
    <>
      <AuthTabs active="sign-up" next={next} />
      <AuthHeading title="Create your account">Free to start. No card needed.</AuthHeading>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Full name"
          name="displayName"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={errors.displayName}
          maxLength={80}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          required
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          required
          hint={password ? undefined : 'At least 12 characters.'}
          after={
            password ? (
              <PasswordRules password={password} context={{ email, name: displayName }} />
            ) : null
          }
        />
        <div className="flex flex-col gap-1.5">
          <Checkbox
            name="acceptTerms"
            checked={acceptTerms}
            onChange={(event) => setAcceptTerms(event.target.checked)}
            aria-invalid={errors.acceptTerms ? true : undefined}
            aria-describedby={errors.acceptTerms ? 'accept-terms-error' : undefined}
            label={
              <>
                I agree to the{' '}
                <Link href="/terms" className="text-primary underline underline-offset-2">
                  terms
                </Link>{' '}
                and have read the{' '}
                <Link href="/ai-disclosure" className="text-primary underline underline-offset-2">
                  AI disclosure
                </Link>
                .
              </>
            }
          />
          {errors.acceptTerms ? (
            <p id="accept-terms-error" className="text-caption text-danger-text">
              {errors.acceptTerms}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" block loading={submitting}>
          Create account
        </Button>
      </form>
    </>
  );
}
