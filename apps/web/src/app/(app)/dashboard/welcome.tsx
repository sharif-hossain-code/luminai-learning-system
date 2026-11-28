'use client';

import { useCurrentUser } from '@/components/app/user-context';
import { ButtonLink } from '@/components/ui/button';
import { DOMAIN_OPTIONS } from '@/lib/learning-options';

/** The learner's goals, shown on the dashboard until they enrol in a course. */
export function GoalsCard() {
  const user = useCurrentUser();
  const goals = DOMAIN_OPTIONS.filter((domain) =>
    user.profile.learningGoals.includes(domain.value),
  );

  return (
    <section
      className="rounded-xl border border-subtle bg-surface p-6"
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
  );
}
