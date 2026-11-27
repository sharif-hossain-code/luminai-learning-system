import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { OnboardingFrame } from '@/components/onboarding-frame';
import { getCurrentUser } from '@/lib/session';
import { OnboardingWizard } from './onboarding-wizard';

export const metadata: Metadata = { title: 'Set up your learning' };

async function OnboardingGate() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=/onboarding');
  return <OnboardingWizard user={user} />;
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <OnboardingFrame>
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">Loading…</span>
            <div className="h-2 w-full animate-pulse rounded-full bg-subtle" />
            <div className="h-9 w-2/3 animate-pulse rounded-md bg-subtle" />
            <div className="h-40 w-full animate-pulse rounded-lg bg-subtle" />
          </div>
        </OnboardingFrame>
      }
    >
      <OnboardingGate />
    </Suspense>
  );
}
