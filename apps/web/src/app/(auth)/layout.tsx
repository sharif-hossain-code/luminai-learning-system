import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';

const POINTS = [
  'Structured courses in language, communication and leadership',
  "An AI mentor grounded in the lesson you're on",
  'Progress saved automatically, so you can resume anytime',
];

/** Split layout from the design: brand panel on the left, a 420px form column on the right. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex flex-col gap-8 bg-inverse px-6 py-8 text-on-inverse sm:px-10 lg:w-1/2 lg:justify-between lg:gap-12 lg:p-14">
        <Logo inverse />
        <div className="hidden max-w-[460px] flex-col gap-5 lg:flex">
          <p className="text-display font-semibold">
            Learn at your pace, with a mentor beside you.
          </p>
          <ul className="flex flex-col gap-3.5 text-on-inverse-muted">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <Check
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-on-inverse-accent"
                  strokeWidth={2.2}
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="hidden text-support text-on-inverse-muted lg:block">
          Your data is handled as described in our{' '}
          <a href="/privacy" className="text-on-inverse-link underline underline-offset-2">
            privacy policy
          </a>
          .
        </p>
      </aside>
      <main
        id="main-content"
        className="flex flex-1 items-start justify-center px-6 py-10 sm:items-center sm:py-14 lg:w-1/2"
      >
        <div className="flex w-full max-w-[420px] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
