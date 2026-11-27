import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Segmented switch between sign-up and sign-in. They are separate pages, so these are links. */
export function AuthTabs({
  active,
  next,
}: {
  active: 'sign-up' | 'sign-in';
  next?: string | undefined;
}) {
  const query = next ? `?next=${encodeURIComponent(next)}` : '';
  const tabs = [
    { id: 'sign-up', label: 'Create account', href: `/sign-up${query}` },
    { id: 'sign-in', label: 'Sign in', href: `/sign-in${query}` },
  ] as const;
  return (
    <nav aria-label="Account" className="flex gap-1 rounded-md bg-segmented p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? 'page' : undefined}
          className={cn(
            'flex h-10 flex-1 items-center justify-center rounded-[10px] text-support font-semibold transition-colors',
            tab.id === active ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted hover:text-fg',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
