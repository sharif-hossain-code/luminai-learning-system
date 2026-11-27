'use client';

import { CircleCheck, Mail, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthHeading } from '@/components/auth/auth-heading';
import { RequestLinkForm } from '@/components/auth/request-link-form';
import { IconBadge } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api-client';

type State = 'verifying' | 'verified' | 'invalid' | 'error' | 'resent';

export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>(token ? 'verifying' : 'invalid');
  const [resentTo, setResentTo] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    // Keep the one-time token out of history and any later Referer header.
    window.history.replaceState(null, '', '/verify-email');
    apiFetch('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('verified'))
      .catch((error: unknown) =>
        setState(
          error instanceof ApiError && error.status >= 400 && error.status < 500
            ? 'invalid'
            : 'error',
        ),
      );
  }, [token]);

  if (state === 'verifying') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
        <span
          aria-hidden
          className="size-9 animate-spin rounded-full border-3 border-primary border-r-transparent"
        />
        <h1 className="text-h2 font-semibold">Verifying your email…</h1>
        <p className="text-fg-muted">This only takes a moment.</p>
      </div>
    );
  }

  if (state === 'verified') {
    return (
      <>
        <IconBadge tone="success">
          <CircleCheck aria-hidden className="size-6" />
        </IconBadge>
        <AuthHeading title="Email verified">
          Thanks, your account is active. Next, tell us what you want to learn so we can suggest the
          right courses. It takes about a minute.
        </AuthHeading>
        <ButtonLink href="/onboarding" size="lg" block>
          Set up my learning
        </ButtonLink>
        <Link
          href="/dashboard"
          className="text-center font-semibold text-primary hover:text-primary-hover"
        >
          Skip for now and go to dashboard
        </Link>
      </>
    );
  }

  if (state === 'resent') {
    return (
      <>
        <IconBadge>
          <Mail aria-hidden className="size-6" />
        </IconBadge>
        <AuthHeading title="Check your email">
          If <strong className="font-semibold text-fg">{resentTo}</strong> has an account waiting
          for verification, we&apos;ve sent a new link. It expires in 24 hours.
        </AuthHeading>
        <ButtonLink href="/sign-in" variant="secondary" size="lg" block>
          Back to sign in
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <IconBadge tone="danger">
        <X aria-hidden className="size-6" />
      </IconBadge>
      <AuthHeading
        title={
          state === 'error'
            ? 'We couldn’t verify your email right now'
            : 'We couldn’t verify this link'
        }
      >
        {state === 'error'
          ? 'Something went wrong on our side. Try the link again in a moment, or request a new one.'
          : 'The link has expired, is incomplete or has already been used. Verification links last 24 hours and work once. Enter your email and we’ll send a fresh one.'}
      </AuthHeading>
      <RequestLinkForm
        path="/auth/resend-verification"
        submitLabel="Send a new link"
        onSent={(email) => {
          setResentTo(email);
          setState('resent');
        }}
      />
      <p className="text-center text-support text-fg-muted">
        Already verified?{' '}
        <Link href="/sign-in" className="text-primary underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </>
  );
}
