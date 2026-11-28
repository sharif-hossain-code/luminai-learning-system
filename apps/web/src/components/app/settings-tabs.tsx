'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/settings', label: 'Profile' },
  { href: '/settings/security', label: 'Security' },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="mt-8 flex gap-6 border-b border-subtle">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-1 pb-3 text-body font-medium transition-colors',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A settings card row: 280px description column on the left, controls on the right. */
export function SettingsSection({
  title,
  description,
  children,
  tone = 'default',
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <section className="grid gap-5 border-b border-subtle p-6 last:border-b-0 sm:p-7 md:grid-cols-[280px_1fr] md:gap-10">
      <div>
        <h2 className={cn('text-h3 font-semibold', tone === 'danger' && 'text-danger-text')}>
          {title}
        </h2>
        {description ? <p className="mt-1 text-support text-fg-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
