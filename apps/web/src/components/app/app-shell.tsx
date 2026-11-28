import type { CurrentUser } from '@luminai/contracts';
import type { ReactNode } from 'react';
import { AppSidebar } from './app-sidebar';
import { UserProvider } from './user-context';

/** The signed-in frame: sidebar (or mobile top bar) and the main column. Pages set their own width. */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <UserProvider user={user}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <AppSidebar />
        <main id="main-content" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-9">
          {children}
        </main>
      </div>
    </UserProvider>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-[264px] border-r border-subtle bg-surface lg:block" />
      <main id="main-content" className="flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-9">
        <div role="status" className="flex max-w-[1000px] flex-col gap-4">
          <span className="sr-only">Loading…</span>
          <div className="h-9 w-48 animate-pulse rounded-md bg-subtle" />
          <div className="h-5 w-96 max-w-full animate-pulse rounded-md bg-subtle" />
          <div className="mt-4 h-64 animate-pulse rounded-xl bg-subtle" />
        </div>
      </main>
    </div>
  );
}
