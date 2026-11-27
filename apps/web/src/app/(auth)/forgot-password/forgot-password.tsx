'use client';

import { ChevronLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AuthHeading } from '@/components/auth/auth-heading';
import { RequestLinkForm } from '@/components/auth/request-link-form';
import { ResendButton } from '@/components/auth/resend-button';
import { IconBadge } from '@/components/ui/alert';

export function ForgotPassword() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <>
        <IconBadge>
          <MailCheck aria-hidden className="size-6" />
        </IconBadge>
        <AuthHeading title="Check your email">
          If an account exists for <strong className="font-semibold text-fg">{sentTo}</strong>,
          we&apos;ve sent a link to reset the password. It expires in 1 hour.
        </AuthHeading>
        <ResendButton path="/auth/forgot-password" email={sentTo} />
        <Link
          href="/sign-in"
          className="text-center text-support text-primary underline underline-offset-2"
        >
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <Link
        href="/sign-in"
        className="flex w-fit items-center gap-1 text-support font-medium text-fg-muted hover:text-fg"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Back to sign in
      </Link>
      <AuthHeading title="Reset your password">
        Enter the email you use for Luminai and we&apos;ll send you a link to choose a new password.
      </AuthHeading>
      <RequestLinkForm
        path="/auth/forgot-password"
        submitLabel="Send reset link"
        onSent={setSentTo}
      />
    </>
  );
}
