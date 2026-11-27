import type { ReactNode } from 'react';

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-h1 font-semibold">{title}</h1>
      {children ? <div className="text-body text-fg-muted">{children}</div> : null}
    </div>
  );
}
