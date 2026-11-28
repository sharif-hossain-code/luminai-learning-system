import type { LearningDomain } from '@luminai/contracts';
import { MessageSquareText, Mic, Network, type LucideIcon } from 'lucide-react';

export const DOMAIN_OPTIONS: readonly {
  value: LearningDomain;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile, from the domain colour tokens. */
  tile: string;
}[] = [
  {
    value: 'language',
    label: 'Language',
    description: 'Grammar, vocabulary, writing, professional English and pronunciation.',
    icon: MessageSquareText,
    tile: 'bg-domain-language-subtle text-domain-language',
  },
  {
    value: 'communication',
    label: 'Communication',
    description: 'Public speaking, presentations, listening and negotiation.',
    icon: Mic,
    tile: 'bg-domain-communication-subtle text-domain-communication',
  },
  {
    value: 'leadership',
    label: 'Leadership',
    description: 'Decisions, teamwork, conflict resolution and emotional intelligence.',
    icon: Network,
    tile: 'bg-domain-leadership-subtle text-domain-leadership',
  },
];

export const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner', description: "I'm just starting out" },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'I can manage most everyday situations',
  },
  { value: 'advanced', label: 'Advanced', description: 'I want to polish and go deeper' },
] as const;

export const FREQUENCY_OPTIONS = [
  { value: 'occasionally', label: 'A few times a month' },
  { value: 'weekly', label: '1–2 times a week' },
  { value: 'few_times_week', label: '3–4 times a week' },
  { value: 'daily', label: 'Every day' },
] as const;

/** The interface is English-only for now; these set spelling, dates and the mentor's variety of English. */
const LOCALE_LABELS: Record<string, string> = {
  'en-GB': 'English (United Kingdom)',
  'en-US': 'English (United States)',
  'en-AU': 'English (Australia)',
  'en-CA': 'English (Canada)',
  'en-IN': 'English (India)',
  'en-IE': 'English (Ireland)',
  'en-NZ': 'English (New Zealand)',
  'en-ZA': 'English (South Africa)',
};
const LOCALES = Object.keys(LOCALE_LABELS);

export function localeOptions(current: string): { value: string; label: string }[] {
  const options = LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] ?? value }));
  return LOCALES.includes(current)
    ? options
    : [{ value: current, label: current === 'en' ? 'English' : current }, ...options];
}

/** Browser locale if it's one we offer, otherwise British English. */
export function detectLocale(): string {
  const candidates = typeof navigator === 'undefined' ? [] : navigator.languages;
  return candidates.find((tag) => LOCALES.includes(tag)) ?? 'en-GB';
}

export function detectTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function offsetLabel(timeZone: string, now: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((item) => item.type === 'timeZoneName')?.value;
  return !part || part === 'GMT' ? 'GMT+00:00' : part;
}

/** "(GMT+06:00) Dhaka" style labels, sorted by offset. Call on the client only. */
export function timeZoneOptions(current: string): { value: string; label: string }[] {
  const now = new Date();
  const zones = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC', current]);
  return [...zones]
    .map((zone) => {
      const offset = offsetLabel(zone, now);
      const city = zone.split('/').pop()?.replaceAll('_', ' ') ?? zone;
      return { value: zone, label: `(${offset}) ${city}`, offset };
    })
    .sort((a, b) => toMinutes(a.offset) - toMinutes(b.offset) || a.label.localeCompare(b.label))
    .map(({ value, label }) => ({ value, label }));
}

function toMinutes(offset: string): number {
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset);
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}
