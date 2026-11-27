import type { Metadata } from 'next';
import { ChangePasswordForm } from './change-password-form';
import { SessionsList } from './sessions-list';

export const metadata: Metadata = { title: 'Security settings' };

export default function SecuritySettingsPage() {
  return (
    <div className="overflow-hidden rounded-xl border border-subtle bg-surface">
      <ChangePasswordForm />
      <SessionsList />
    </div>
  );
}
