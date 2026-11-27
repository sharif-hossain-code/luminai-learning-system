'use client';

import type { CurrentUser, LearningDomain, Preferences } from '@luminai/contracts';
import { Check } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { OnboardingFrame } from '@/components/onboarding-frame';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import {
  detectLocale,
  detectTimeZone,
  DOMAIN_OPTIONS,
  FREQUENCY_OPTIONS,
  LEVEL_OPTIONS,
  localeOptions,
} from '@/lib/learning-options';
import { safeNextPath } from '@/lib/safe-next';
import { useTimeZoneOptions } from '@/lib/use-time-zones';

type Step = 1 | 2 | 3;
type Levels = Preferences['levels'];
type Frequency = NonNullable<Preferences['practiceFrequency']>;

const TITLES: Record<Step, { title: string; description: string }> = {
  1: {
    title: 'What do you want to get better at?',
    description:
      "Choose one or more. We'll use this to suggest courses and to guide your AI mentor. You can change it later in settings.",
  },
  2: {
    title: 'Where are you starting from?',
    description:
      'A quick self-assessment for each goal you picked. There are no wrong answers, and a placement check can adjust it later.',
  },
  3: {
    title: 'A few last details',
    description:
      "We filled these in from your browser. Check they're right so reminders arrive at sensible times.",
  },
};

export function OnboardingWizard({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const requested = safeNextPath(useSearchParams().get('next'));
  const next = requested.startsWith('/onboarding') ? '/dashboard' : requested;
  const [step, setStep] = useState<Step>(1);
  const [goals, setGoals] = useState<LearningDomain[]>(user.profile.learningGoals);
  const [levels, setLevels] = useState<Levels>(user.preferences.levels ?? {});
  const [locale, setLocale] = useState(user.profile.locale);
  const [timezone, setTimezone] = useState(user.profile.timezone);
  const [frequency, setFrequency] = useState<Frequency | null>(
    user.preferences.practiceFrequency ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeZones = useTimeZoneOptions(timezone);

  function goTo(target: Step) {
    if (target === 3) {
      // Fill in browser values when the profile still has the defaults.
      if (user.profile.locale === 'en') setLocale(detectLocale());
      if (user.profile.timezone === 'UTC') setTimezone(detectTimeZone());
    }
    setError(null);
    setStep(target);
    window.scrollTo({ top: 0 });
  }

  async function save(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  function finish() {
    router.replace(next);
  }

  async function continueFromGoals() {
    const ok = await save(() =>
      apiFetch('/users/me/profile', { method: 'PATCH', body: { learningGoals: goals } }),
    );
    if (ok) goTo(goals.length > 0 ? 2 : 3);
  }

  async function continueFromLevels() {
    const picked = Object.fromEntries(
      goals.flatMap((goal) => (levels[goal] ? [[goal, levels[goal]]] : [])),
    );
    const ok = await save(() =>
      apiFetch('/users/me/preferences', { method: 'PATCH', body: { levels: picked } }),
    );
    if (ok) goTo(3);
  }

  async function finishSetup() {
    const ok = await save(async () => {
      await apiFetch('/users/me/profile', { method: 'PATCH', body: { locale, timezone } });
      await apiFetch('/users/me/preferences', {
        method: 'PATCH',
        body: { practiceFrequency: frequency, onboardingCompletedAt: new Date().toISOString() },
      });
    });
    if (ok) finish();
  }

  async function skipSetup() {
    const ok = await save(() =>
      apiFetch('/users/me/preferences', {
        method: 'PATCH',
        body: { onboardingCompletedAt: new Date().toISOString() },
      }),
    );
    if (ok) finish();
  }

  const { title, description } = TITLES[step];
  const canContinue =
    step === 1 ? goals.length > 0 : step === 2 ? goals.every((goal) => levels[goal]) : true;

  return (
    <OnboardingFrame
      actions={
        <Button variant="ghost" size="sm" onClick={skipSetup} disabled={saving}>
          Skip setup
        </Button>
      }
    >
      <p
        className="text-overline font-semibold tracking-wider text-fg-muted uppercase"
        id="step-label"
      >
        Step {step} of 3
      </p>
      <div
        className="mt-3 flex gap-1.5"
        role="progressbar"
        aria-labelledby="step-label"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step}
      >
        {[1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              segment <= step ? 'bg-primary' : 'bg-subtle',
            )}
          />
        ))}
      </div>

      <h1 className="mt-8 text-h1 font-semibold sm:text-[2rem] sm:leading-10">{title}</h1>
      <p className="mt-2 text-body text-fg-muted">{description}</p>

      {error ? (
        <Alert tone="danger" className="mt-6">
          {error}
        </Alert>
      ) : null}

      <div className="mt-8">
        {step === 1 ? <GoalsStep goals={goals} onChange={setGoals} /> : null}
        {step === 2 ? (
          <LevelsStep
            goals={goals}
            levels={levels}
            onChange={(goal, level) => setLevels((current) => ({ ...current, [goal]: level }))}
          />
        ) : null}
        {step === 3 ? (
          <div className="flex flex-col gap-6 rounded-xl border border-subtle bg-surface p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Preferred language"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                options={localeOptions(locale)}
                hint="Used for the interface and your AI mentor."
              />
              <SelectField
                label="Time zone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                options={timeZones}
                hint="Detected automatically."
              />
            </div>
            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-2.5 text-support font-medium">
                How often would you like to practise?{' '}
                <span className="font-normal text-fg-muted">(optional)</span>
              </legend>
              <FrequencyChips value={frequency} onChange={setFrequency} />
              <p className="text-caption text-fg-muted">
                We&apos;ll suggest a weekly goal. No pressure, you can change it anytime.
              </p>
            </fieldset>
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-subtle pt-5">
        {step > 1 ? (
          <Button
            variant="secondary"
            onClick={() => goTo(step === 3 && goals.length === 0 ? 1 : ((step - 1) as Step))}
            disabled={saving}
          >
            Back
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => (step === 3 ? skipSetup() : goTo(3))}
          >
            Skip this step
          </Button>
          {step === 1 ? (
            <Button onClick={continueFromGoals} disabled={!canContinue} loading={saving}>
              Continue
            </Button>
          ) : step === 2 ? (
            <Button onClick={continueFromLevels} disabled={!canContinue} loading={saving}>
              Continue
            </Button>
          ) : (
            <Button onClick={finishSetup} loading={saving}>
              Finish setup
            </Button>
          )}
        </div>
      </div>
    </OnboardingFrame>
  );
}

function GoalsStep({
  goals,
  onChange,
}: {
  goals: LearningDomain[];
  onChange: (goals: LearningDomain[]) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Learning goals</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        {DOMAIN_OPTIONS.map(({ value, label, description, icon: Icon, tile }) => {
          const checked = goals.includes(value);
          return (
            <label
              key={value}
              className={cn(
                'relative flex cursor-pointer flex-col gap-3 rounded-lg border bg-surface p-6 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-focus-halo',
                checked
                  ? 'border-2 border-primary bg-surface-raised p-[23px]'
                  : 'border-subtle hover:border-default',
              )}
            >
              <input
                type="checkbox"
                className="absolute top-6 right-6 size-[22px] cursor-pointer accent-[var(--brand-primary)]"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...goals, value]
                      : goals.filter((goal) => goal !== value),
                  )
                }
              />
              <span className={cn('flex size-14 items-center justify-center rounded-lg', tile)}>
                <Icon aria-hidden className="size-6" />
              </span>
              <span className="text-h3 font-semibold">{label}</span>
              <span className="text-support text-fg-muted">{description}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-4 text-caption text-fg-muted" aria-live="polite">
        {goals.length} selected
      </p>
    </fieldset>
  );
}

function LevelsStep({
  goals,
  levels,
  onChange,
}: {
  goals: LearningDomain[];
  levels: Levels;
  onChange: (goal: LearningDomain, level: (typeof LEVEL_OPTIONS)[number]['value']) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {DOMAIN_OPTIONS.filter((domain) => goals.includes(domain.value)).map(
        ({ value: goal, label, icon: Icon, tile }) => (
          <fieldset key={goal} className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
            <legend className="sr-only">{label} level</legend>
            <div className="mb-4 flex items-center gap-3" aria-hidden>
              <span className={cn('flex size-14 items-center justify-center rounded-lg', tile)}>
                <Icon className="size-6" />
              </span>
              <span className="text-h3 font-semibold">{label}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {LEVEL_OPTIONS.map((level) => {
                const checked = levels[goal] === level.value;
                return (
                  <label
                    key={level.value}
                    className={cn(
                      'flex cursor-pointer gap-2.5 rounded-md border p-4 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-focus-halo',
                      checked
                        ? 'border-2 border-primary bg-primary-subtle p-[15px]'
                        : 'border-default hover:bg-hover',
                    )}
                  >
                    <input
                      type="radio"
                      name={`level-${goal}`}
                      value={level.value}
                      checked={checked}
                      onChange={() => onChange(goal, level.value)}
                      className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--brand-primary)]"
                    />
                    <span className="flex flex-col">
                      <span
                        className={cn('font-semibold', checked ? 'text-primary-strong' : 'text-fg')}
                      >
                        {level.label}
                      </span>
                      <span className="text-caption text-fg-muted">{level.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ),
      )}
    </div>
  );
}

function FrequencyChips({
  value,
  onChange,
}: {
  value: Frequency | null;
  onChange: (value: Frequency | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {FREQUENCY_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : option.value)}
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-support font-medium transition-colors',
              selected
                ? 'border-inverse bg-inverse text-on-inverse'
                : 'border-default bg-surface text-fg hover:bg-hover',
            )}
          >
            {selected ? <Check aria-hidden className="size-4" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
