'use client';

import { BookOpen, Compass, LayoutGrid, LogOut, Menu, PenSquare, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { initials, useCurrentUser } from './user-context';

// Practice, mentor and assessment pages join this list in later phases.
const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/courses', label: 'Explore courses', icon: Compass },
  { href: '/learning', label: 'My learning', icon: BookOpen },
];

/** Shown to content editors and administrators only (the API enforces access). */
const STUDIO = { href: '/studio', label: 'Course studio', icon: PenSquare };

function NavLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-11 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors',
        active
          ? 'bg-primary-subtle text-primary-strong'
          : 'text-fg-nav hover:bg-hover hover:text-fg',
      )}
    >
      <Icon aria-hidden className="size-5" />
      {label}
    </Link>
  );
}

export function AppSidebar() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const panelId = useId();
  const close = () => setOpen(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // The session may already be gone; sign-in is the right place either way.
    }
    // Full page load, so nothing from the signed-in session stays in the router cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full load at the auth boundary
    window.location.assign('/sign-in?notice=signed-out');
  }

  const panel = (
    <>
      <nav aria-label="App" className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink key={item.href} {...item} onNavigate={close} />
        ))}
        {user.role !== 'LEARNER' ? <NavLink {...STUDIO} onNavigate={close} /> : null}
      </nav>
      <div className="mt-auto flex flex-col gap-1 pt-6">
        <NavLink href="/settings" label="Profile & settings" icon={Settings} onNavigate={close} />
        <div className="mt-3 flex items-center gap-3 border-t border-subtle px-1 pt-4">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary-subtle text-support font-semibold text-secondary"
          >
            {initials(user)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-support font-medium">
              {user.profile.displayName ?? 'Learner'}
            </span>
            <span className="block truncate text-caption text-fg-muted">{user.email}</span>
          </span>
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="flex h-11 items-center gap-3 rounded-md px-3 text-body font-medium text-fg-nav hover:bg-hover hover:text-fg disabled:opacity-60"
        >
          <LogOut aria-hidden className="size-5" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: fixed 264px sidebar. */}
      <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-subtle bg-surface px-4 py-6 lg:flex">
        <Logo href="/dashboard" className="mb-8 px-2" />
        {panel}
      </aside>

      {/* Mobile: top bar with a slide-down menu. */}
      <div className="sticky top-0 z-40 border-b border-subtle bg-surface lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Logo href="/dashboard" />
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-hover"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
          </button>
        </div>
        <div id={panelId} hidden={!open} className="flex flex-col border-t border-subtle px-4 py-4">
          {panel}
        </div>
      </div>
    </>
  );
}
