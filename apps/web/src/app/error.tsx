'use client';

import { useEffect } from 'react';
import { Container } from '@/components/container';

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Replaced by the error-monitoring service in the hardening phase.
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="flex-1">
      <Container className="py-16">
        <div role="alert" className="glass-panel max-w-xl p-6">
          <h1 className="text-h2 font-semibold">Something went wrong</h1>
          <p className="mt-2 text-fg-muted">This page couldn&apos;t load. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-fg hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </Container>
    </main>
  );
}
