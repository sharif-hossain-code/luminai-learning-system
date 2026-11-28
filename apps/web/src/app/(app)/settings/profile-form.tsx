'use client';

import { displayNameSchema, type LearningDomain, type Preferences } from '@luminai/contracts';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SettingsSection } from '@/components/app/settings-tabs';
import { initials, useCurrentUser } from '@/components/app/user-context';
import { Alert, Pill } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import {
  DOMAIN_OPTIONS,
  FREQUENCY_OPTIONS,
  LEVEL_OPTIONS,
  localeOptions,
} from '@/lib/learning-options';
import { useTimeZoneOptions } from '@/lib/use-time-zones';

type Levels = Preferences['levels'];

export function ProfileForm() {
  const user = useCurrentUser();
  const router = useRouter();
  const initial = {
    displayName: user.profile.displayName ?? '',
    locale: user.profile.locale,
    timezone: user.profile.timezone,
    goals: user.profile.learningGoals,
    levels: user.preferences.levels ?? {},
    frequency: user.preferences.practiceFrequency ?? '',
  };
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [locale, setLocale] = useState(initial.locale);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [goals, setGoals] = useState<LearningDomain[]>(initial.goals);
  const [levels, setLevels] = useState<Levels>(initial.levels);
  const [frequency, setFrequency] = useState<string>(initial.frequency);
  const [nameError, setNameError] = useState<string | undefined>();
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; message: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const timeZones = useTimeZoneOptions(timezone);

  function reset() {
    setDisplayName(initial.displayName);
    setLocale(initial.locale);
    setTimezone(initial.timezone);
    setGoals(initial.goals);
    setLevels(initial.levels);
    setFrequency(initial.frequency);
    setNameError(undefined);
    setStatus(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const trimmed = displayName.trim();
    if (trimmed) {
      const parsed = displayNameSchema.safeParse(trimmed);
      if (!parsed.success) {
        setNameError(parsed.error.issues[0]?.message);
        return;
      }
    }
    setNameError(undefined);
    setSaving(true);
    try {
      await apiFetch('/users/me/profile', {
        method: 'PATCH',
        body: { displayName: trimmed || null, locale, timezone, learningGoals: goals },
      });
      const keptLevels = Object.fromEntries(
        goals.flatMap((goal) => (levels[goal] ? [[goal, levels[goal]]] : [])),
      );
      await apiFetch('/users/me/preferences', {
        method: 'PATCH',
        body: { levels: keptLevels, practiceFrequency: frequency || null },
      });
      setStatus({ tone: 'success', message: 'Your changes are saved.' });
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldMessage('displayName')) {
        setNameError(caught.fieldMessage('displayName'));
      } else {
        setStatus({
          tone: 'danger',
          message:
            caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="overflow-hidden rounded-xl border border-subtle bg-surface"
    >
      <SettingsSection
        title="Public profile"
        description="Shown on certificates and to your AI mentor."
      >
        <div className="flex flex-col gap-4">
          <span
            aria-hidden
            className="flex size-[72px] items-center justify-center rounded-full bg-secondary-subtle text-h2 font-semibold text-secondary"
          >
            {initials(user)}
          </span>
          <TextField
            label="Display name"
            size="md"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            error={nameError}
            maxLength={80}
          />
          <TextField
            label="Email"
            size="md"
            type="email"
            value={user.email}
            readOnly
            hint={
              <span className="flex flex-wrap items-center gap-2">
                To change your email, contact support.
                {user.emailVerifiedAt ? <Pill>Verified</Pill> : null}
              </span>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Language and region"
        description="Used for the interface, reminders and your mentor's replies."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Language"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            options={localeOptions(locale)}
          />
          <SelectField
            label="Time zone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            options={timeZones}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Learning goals" description="We use these to recommend courses.">
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="Learning goals" className="flex flex-wrap gap-2.5">
            {DOMAIN_OPTIONS.map((domain) => {
              const selected = goals.includes(domain.value);
              return (
                <button
                  key={domain.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setGoals(
                      selected
                        ? goals.filter((goal) => goal !== domain.value)
                        : [...goals, domain.value],
                    )
                  }
                  className={cn(
                    'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-support font-medium transition-colors',
                    selected
                      ? 'border-inverse bg-inverse text-on-inverse'
                      : 'border-default bg-surface text-fg hover:bg-hover',
                  )}
                >
                  {selected ? <Check aria-hidden className="size-4" /> : null}
                  {domain.label}
                </button>
              );
            })}
          </div>
          {goals.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {DOMAIN_OPTIONS.filter((domain) => goals.includes(domain.value)).map((domain) => (
                <SelectField
                  key={domain.value}
                  label={`${domain.label} level`}
                  value={levels[domain.value] ?? ''}
                  onChange={(event) =>
                    setLevels((current) => ({
                      ...current,
                      [domain.value]: event.target.value as (typeof LEVEL_OPTIONS)[number]['value'],
                    }))
                  }
                  options={[
                    ...(levels[domain.value] ? [] : [{ value: '', label: 'Not set' }]),
                    ...LEVEL_OPTIONS.map(({ value, label }) => ({ value, label })),
                  ]}
                />
              ))}
            </div>
          ) : null}
          <SelectField
            label="Practice frequency"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
            options={[{ value: '', label: 'No preference' }, ...FREQUENCY_OPTIONS]}
          />
        </div>
      </SettingsSection>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-subtle bg-surface-raised px-6 py-5 sm:px-7">
        {status ? (
          <Alert tone={status.tone} className="mr-auto py-2">
            {status.message}
          </Alert>
        ) : null}
        <Button variant="secondary" onClick={reset} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
