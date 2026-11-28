import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';

/** Onboarding chrome from the design: 72px top bar and a 720px column. */
export function OnboardingFrame({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-subtle bg-surface px-6 sm:px-10">
        <Logo href="/dashboard" />
        {actions}
      </header>
      <main id="main-content" className="flex-1 px-6 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-[720px]">{children}</div>
      </main>
    </>
  );
}
