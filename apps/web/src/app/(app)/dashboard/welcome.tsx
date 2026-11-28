'use client';

import type { ReactNode } from 'react';
import { useCurrentUser } from '@/components/app/user-context';
import { ButtonLink } from '@/components/ui/button';
import { DOMAIN_OPTIONS } from '@/lib/learning-options';

/** Placeholder dashboard until enrolment and progress arrive (Phase 4). */
export function Welcome({ children }: { children?: ReactNode }) {
  const user = useCurrentUser();
  const firstName = user.profile.displayName?.split(' ')[0];
  const goals = DOMAIN_OPTIONS.filter((domain) =>
    user.profile.learningGoals.includes(domain.value),
  );

  return (
    <div className="w-full max-w-[1000px]">
      <h1 className="text-[2rem] leading-10 font-semibold">
        {firstName ? `Welcome, ${firstName}` : 'Welcome to Luminai'}
      </h1>
      <p className="mt-2 text-fg-muted">Your courses and progress will appear here.</p>

      <section
        className="mt-8 rounded-xl border border-subtle bg-surface p-6"
        aria-labelledby="goals-heading"
      >
        <h2 id="goals-heading" className="text-h3 font-semibold">
          Your learning goals
        </h2>
        {goals.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-3">
            {goals.map(({ value, label, icon: Icon, tile }) => (
              <li
                key={value}
                className="flex items-center gap-2.5 rounded-md border border-subtle px-3 py-2"
              >
                <span className={`flex size-8 items-center justify-center rounded-sm ${tile}`}>
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="font-medium">{label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-support text-fg-muted">
            You haven&apos;t picked any goals yet. Choose some so we can suggest courses.
          </p>
        )}
        <ButtonLink
          href={goals.length > 0 ? '/settings' : '/onboarding'}
          variant="secondary"
          className="mt-5"
        >
          {goals.length > 0 ? 'Change goals' : 'Choose goals'}
        </ButtonLink>
      </section>

      {children}
    </div>
  );
}
