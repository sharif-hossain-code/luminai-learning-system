import type { ReactNode } from 'react';
import { Container } from './container';

/** Wrapper for legal pages. The texts are drafts until legal review (see docs/assumptions.md). */
export function DraftLegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Container className="max-w-3xl py-12 sm:py-16">
      <h1 className="text-h1 font-semibold">{title}</h1>
      <p className="mt-3 rounded-md bg-warning-subtle px-4 py-3 text-support text-warning-text">
        Draft for development. This text has not been reviewed and is not the final policy.
      </p>
      <div className="mt-8 flex flex-col gap-4 text-fg-muted [&_h2]:mt-4 [&_h2]:text-h3 [&_h2]:font-semibold [&_h2]:text-fg">
        {children}
      </div>
    </Container>
  );
}
