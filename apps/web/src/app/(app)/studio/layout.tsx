import { ShieldAlert } from 'lucide-react';
import { Suspense, type ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/session';

/**
 * The course studio is for content editors and administrators. This check only
 * decides what to show; every studio request is authorised again by the API.
 */
async function StudioGate({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user && user.role !== 'LEARNER') return children;
  return (
    <div className="flex max-w-[560px] flex-col items-start gap-3 rounded-lg border border-subtle bg-surface p-8">
      <ShieldAlert aria-hidden className="size-7 text-fg-subtle" />
      <h1 className="text-h2 font-semibold">The course studio is for content editors</h1>
      <p className="text-fg-muted">
        Ask an administrator for the content editor role if you need to create or edit courses.
      </p>
      <ButtonLink href="/courses" variant="secondary" className="mt-2">
        Explore courses
      </ButtonLink>
    </div>
  );
}

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-subtle" />}>
        <StudioGate>{children}</StudioGate>
      </Suspense>
    </div>
  );
}
