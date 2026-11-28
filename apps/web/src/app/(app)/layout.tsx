import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { AppSidebar } from '@/components/app/app-sidebar';
import { UserProvider } from '@/components/app/user-context';
import { getCurrentUser } from '@/lib/session';

async function SignedInShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // The proxy already sent cookie-less visitors to sign-in; this catches expired or revoked sessions.
  if (!user) redirect('/sign-in');
  return (
    <UserProvider user={user}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <AppSidebar />
        <main id="main-content" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-9">
          <div className="w-full max-w-[1000px]">{children}</div>
        </main>
      </div>
    </UserProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-[264px] border-r border-subtle bg-surface lg:block" />
      <main id="main-content" className="flex-1 px-10 py-9">
        <div role="status" className="mx-auto flex max-w-[1000px] flex-col gap-4">
          <span className="sr-only">Loading…</span>
          <div className="h-9 w-48 animate-pulse rounded-md bg-subtle" />
          <div className="h-5 w-96 max-w-full animate-pulse rounded-md bg-subtle" />
          <div className="mt-4 h-64 animate-pulse rounded-xl bg-subtle" />
        </div>
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}
