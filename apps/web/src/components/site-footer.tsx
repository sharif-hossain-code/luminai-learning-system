import Link from 'next/link';
import { Container } from './container';

const LINKS = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/ai-disclosure', label: 'AI disclosure' },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-subtle py-8">
      <Container className="flex flex-col gap-3 text-support text-fg-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Luminai Learning System. Early development preview.</p>
        <nav aria-label="Legal">
          <ul className="flex gap-4">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-fg hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
