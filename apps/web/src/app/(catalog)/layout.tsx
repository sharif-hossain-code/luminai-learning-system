import { Suspense, type ReactNode } from 'react';
import { AppShell, ShellSkeleton } from '@/components/app/app-shell';
import { Container } from '@/components/container';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getCurrentUser } from '@/lib/session';

/**
 * The catalogue is public (assumption A3). Signed-in learners see it inside the app
 * with the sidebar; visitors see it with the public site header and footer.
 */
async function CatalogFrame({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user) return <AppShell user={user}>{children}</AppShell>;
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1 py-10 sm:py-12">
        <Container>{children}</Container>
      </main>
      <SiteFooter />
    </>
  );
}

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <CatalogFrame>{children}</CatalogFrame>
    </Suspense>
  );
}
