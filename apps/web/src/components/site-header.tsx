'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { Container } from './container';
import { ThemeToggle } from './theme-toggle';

// Placeholder navigation until the learner app exists (see the design spec's navigation model).
const NAV_ITEMS = [
  { href: '/#domains', label: 'Learning domains' },
  { href: '/#mentor', label: 'AI mentor' },
  { href: '/status', label: 'System status' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <header className="sticky top-0 z-40 border-b border-subtle bg-canvas/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="text-h3 font-semibold tracking-tight text-fg">
          Luminai
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-md px-3 py-2 text-support text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg md:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
          </button>
        </div>
      </Container>

      <nav
        id={menuId}
        aria-label="Main mobile"
        hidden={!open}
        className="border-t border-subtle md:hidden"
      >
        <Container>
          <ul className="flex flex-col py-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-3 text-body text-fg hover:bg-surface"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </nav>
    </header>
  );
}
