import type { ReactNode } from 'react';
import { SettingsTabs } from '@/components/app/settings-tabs';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className="text-[2rem] leading-10 font-semibold">Settings</h1>
      <p className="mt-2 text-fg-muted">
        Manage your profile, learning preferences and account security.
      </p>
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </>
  );
}
