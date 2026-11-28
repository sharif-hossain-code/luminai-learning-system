'use client';

import { evaluatePassword } from '@luminai/contracts';
import { useState, type FormEvent } from 'react';
import { SettingsSection } from '@/components/app/settings-tabs';
import { useCurrentUser } from '@/components/app/user-context';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { PasswordRules } from '@/components/ui/password-rules';
import { ApiError, apiFetch } from '@/lib/api-client';

type Fields = 'currentPassword' | 'newPassword' | 'confirm';

export function ChangePasswordForm() {
  const user = useCurrentUser();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; message: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const context = { email: user.email, name: user.profile.displayName };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const nextErrors: Partial<Record<Fields, string>> = {};
    if (!currentPassword) nextErrors.currentPassword = 'Enter your current password.';
    const evaluation = evaluatePassword(newPassword, context);
    if (!evaluation.ok) nextErrors.newPassword = evaluation.message;
    if (confirm !== newPassword) nextErrors.confirm = "Passwords don't match.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setStatus({
        tone: 'success',
        message: 'Password updated. We signed you out on your other devices.',
      });
      window.dispatchEvent(new Event('luminai:sessions-changed'));
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        (caught.fieldMessage('currentPassword') || caught.fieldMessage('newPassword'))
      ) {
        const currentMessage = caught.fieldMessage('currentPassword');
        const newMessage = caught.fieldMessage('newPassword');
        setErrors({
          ...(currentMessage ? { currentPassword: currentMessage } : {}),
          ...(newMessage ? { newPassword: newMessage } : {}),
        });
      } else {
        setStatus({
          tone: 'danger',
          message:
            caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      title="Password"
      description="Changing it signs you out on your other devices."
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {status ? <Alert tone={status.tone}>{status.message}</Alert> : null}
        {/* Hidden username field helps password managers save the right account. */}
        <input type="email" autoComplete="username" value={user.email} readOnly hidden />
        <TextField
          label="Current password"
          size="md"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={errors.currentPassword}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="New password"
            size="md"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={errors.newPassword}
          />
          <TextField
            label="Confirm new password"
            size="md"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={errors.confirm}
          />
        </div>
        {newPassword ? (
          <PasswordRules password={newPassword} context={context} />
        ) : (
          <p className="text-caption text-fg-muted">
            At least 12 characters. Avoid common passwords and your name.
          </p>
        )}
        <Button type="submit" className="self-start" loading={saving}>
          Update password
        </Button>
      </form>
    </SettingsSection>
  );
}
