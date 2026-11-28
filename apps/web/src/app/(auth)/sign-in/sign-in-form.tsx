'use client';

import { ErrorCode, loginRequestSchema, type CurrentUser } from '@luminai/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthHeading } from '@/components/auth/auth-heading';
import { AuthTabs } from '@/components/auth/auth-tabs';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/api-client';
import { zodFieldErrors } from '@/lib/form-errors';
import { safeNextPath } from '@/lib/safe-next';

type Fields = 'email' | 'password';

export function SignInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? undefined;
  const notice = searchParams.get('notice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [formError, setFormError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(zodFieldErrors<Fields>(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const user = await apiFetch<CurrentUser>('/auth/login', {
        method: 'POST',
        body: parsed.data,
      });
      const target = safeNextPath(next);
      const destination =
        user.preferences.onboardingCompletedAt || target.startsWith('/onboarding')
          ? target
          : `/onboarding${next ? `?next=${encodeURIComponent(target)}` : ''}`;
      // Full page load: crossing the auth boundary must not reuse router-cached redirects.
      window.location.assign(destination);
    } catch (error) {
      setSubmitting(false);
      setFormError(
        error instanceof ApiError
          ? error
          : new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.'),
      );
    }
  }

  return (
    <>
      <AuthTabs active="sign-in" next={next} />
      <AuthHeading title="Welcome back">Sign in to pick up where you left off.</AuthHeading>
      {notice === 'password-reset' && !formError ? (
        <Alert tone="success">Your password was updated. Sign in with your new password.</Alert>
      ) : null}
      {notice === 'signed-out' && !formError ? (
        <Alert tone="info">You&apos;ve been signed out.</Alert>
      ) : null}
      {formError ? (
        <Alert tone="danger">
          {formError.message}
          {formError.code === ErrorCode.EMAIL_NOT_VERIFIED ? (
            <>
              {' '}
              <Link
                href={`/check-email?email=${encodeURIComponent(email.trim())}`}
                className="font-medium underline underline-offset-2"
              >
                Send a new verification link
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
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
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            required
          />
          <Link
            href="/forgot-password"
            className="self-end text-support font-medium text-primary hover:text-primary-hover"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={submitting}>
          Sign in
        </Button>
      </form>
    </>
  );
}
