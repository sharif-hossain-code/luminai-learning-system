import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { AppShell, ShellSkeleton } from '@/components/app/app-shell';
import { getCurrentUser } from '@/lib/session';

async function SignedInShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // The proxy already sent cookie-less visitors to sign-in; this catches expired or revoked sessions.
  if (!user) redirect('/sign-in');
  return <AppShell user={user}>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}
