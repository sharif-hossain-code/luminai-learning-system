'use client';

import { evaluatePassword, type PasswordContext } from '@luminai/contracts';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/** Live password rules and a 4-segment strength meter, using the same rules as the API. */
export function PasswordRules({
  password,
  context,
  id,
}: {
  password: string;
  context: PasswordContext;
  id?: string;
}) {
  const result = evaluatePassword(password, context);
  const rules = [
    { met: result.rules.longEnough, label: 'At least 12 characters' },
    { met: result.rules.notCommon, label: 'Not a commonly used password' },
    { met: result.rules.notPersonal, label: "Doesn't include your name or email" },
  ];
  const strengthTone =
    result.strength <= 1 ? 'bg-danger' : result.strength === 2 ? 'bg-warning' : 'bg-success';
  const textTone =
    result.strength <= 1
      ? 'text-danger-text'
      : result.strength === 2
        ? 'text-warning-text'
        : 'text-success-text';

  return (
    <div id={id} className="flex flex-col gap-3">
      {password ? (
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              aria-hidden
              className={cn(
                'h-1 flex-1 rounded-full',
                segment <= result.strength ? strengthTone : 'bg-subtle',
              )}
            />
          ))}
          <span className={cn('ml-2 w-12 text-right text-caption font-medium', textTone)}>
            {LABELS[result.strength]}
          </span>
        </div>
      ) : null}
      <ul
        className="flex flex-col gap-1 rounded-md bg-muted px-4 py-3 text-caption"
        aria-label="Password rules"
      >
        {rules.map((rule) => (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-2',
              rule.met ? 'text-success-text' : 'text-fg-muted',
            )}
          >
            {rule.met ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              <X aria-hidden className="size-3.5" />
            )}
            {rule.label}
            <span className="sr-only">{rule.met ? '(met)' : '(not met)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
