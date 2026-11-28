'use client';

import { emailSchema } from '@luminai/contracts';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthHeading } from '@/components/auth/auth-heading';
import { ResendButton } from '@/components/auth/resend-button';
import { Alert, IconBadge } from '@/components/ui/alert';
import { ButtonLink } from '@/components/ui/button';

export function CheckEmail() {
  const parsed = emailSchema.safeParse(useSearchParams().get('email') ?? '');
  const email = parsed.success ? parsed.data : null;

  return (
    <>
      <IconBadge>
        <Mail aria-hidden className="size-6" />
      </IconBadge>
      <AuthHeading title="Check your email">
        {email ? (
          <p>
            We sent a verification link to{' '}
            <strong className="font-semibold text-fg">{email}</strong>. Open it to activate your
            account. The link expires in 24 hours.
          </p>
        ) : (
          <p>We sent you a verification link. Open it to activate your account.</p>
        )}
      </AuthHeading>
      {email ? (
        <ResendButton path="/auth/resend-verification" email={email} />
      ) : (
        <ButtonLink href="/sign-up" variant="secondary" size="lg" block>
          Back to sign up
        </ButtonLink>
      )}
      <Alert tone="info">
        Can&apos;t find it? Check your spam or promotions folder, or{' '}
        <Link href="/sign-up" className="underline underline-offset-2">
          use a different email
        </Link>
        .
      </Alert>
      <p className="text-center text-support text-fg-muted">
        Already verified?{' '}
        <Link href="/sign-in" className="text-primary underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </>
  );
}
