'use client';

import { ErrorCode, evaluatePassword } from '@luminai/contracts';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthHeading } from '@/components/auth/auth-heading';
import { Alert, IconBadge } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { PasswordRules } from '@/components/ui/password-rules';
import { ApiError, apiFetch } from '@/lib/api-client';

type State = 'form' | 'done' | 'invalid';

export function ResetPassword() {
  const initialToken = useSearchParams().get('token');
  // Read once, then drop the one-time token from the address bar and history.
  const [token] = useState(initialToken);
  const [state, setState] = useState<State>(initialToken ? 'form' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialToken) window.history.replaceState(null, '', '/reset-password');
  }, [initialToken]);

  const evaluation = evaluatePassword(password);
  const mismatch = confirmTouched && confirm.length > 0 && confirm !== password;
  const canSubmit = evaluation.ok && confirm === password;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !token) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: { token, password } });
      setState('done');
    } catch (caught) {
      setSubmitting(false);
      if (
        caught instanceof ApiError &&
        (caught.code === ErrorCode.TOKEN_INVALID || caught.fieldMessage('token'))
      ) {
        setState('invalid');
      } else if (caught instanceof ApiError && caught.fieldMessage('password')) {
        setError(caught.fieldMessage('password'));
      } else {
        setFormError(
          caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
        );
      }
    }
  }

  if (state === 'done') {
    return (
      <>
        <IconBadge tone="success">
          <CircleCheck aria-hidden className="size-6" />
        </IconBadge>
        <AuthHeading title="Password updated">
          You can now sign in with your new password. We&apos;ve signed you out on your other
          devices.
        </AuthHeading>
        <ButtonLink href="/sign-in" size="lg" block>
          Sign in
        </ButtonLink>
      </>
    );
  }

  if (state === 'invalid') {
    return (
      <>
        <IconBadge tone="warning">
          <TriangleAlert aria-hidden className="size-6" />
        </IconBadge>
        <AuthHeading title="This reset link has expired">
          Reset links last 1 hour and work once. Request a new one to continue.
        </AuthHeading>
        <ButtonLink href="/forgot-password" size="lg" block>
          Request a new link
        </ButtonLink>
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
      <AuthHeading title="Choose a new password" />
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(undefined);
          }}
          error={error}
          aria-describedby="password-rules"
          after={<PasswordRules id="password-rules" password={password} context={{}} />}
          required
          autoFocus
        />
        <TextField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          onBlur={() => setConfirmTouched(true)}
          error={mismatch ? "Passwords don't match." : undefined}
          required
        />
        <Button type="submit" size="lg" block disabled={!canSubmit} loading={submitting}>
          Update password
        </Button>
      </form>
    </>
  );
}
