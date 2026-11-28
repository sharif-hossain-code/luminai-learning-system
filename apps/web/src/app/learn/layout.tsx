import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { UserProvider } from '@/components/app/user-context';
import { getCurrentUser } from '@/lib/session';

/** The lesson player has its own full-width frame (Lesson.dc.html), without the app sidebar. */
async function SignedIn({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return <UserProvider user={user}>{children}</UserProvider>;
}

export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div role="status" className="flex min-h-dvh flex-col">
          <span className="sr-only">Loading lesson…</span>
          <div className="h-16 border-b border-subtle bg-surface" />
          <div className="mx-auto mt-8 h-96 w-full max-w-[760px] animate-pulse rounded-lg bg-subtle" />
        </div>
      }
    >
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}
