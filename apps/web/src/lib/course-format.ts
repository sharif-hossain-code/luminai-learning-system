import type { CourseLevel, CourseStatus, LessonType, ResourceType } from '@luminai/contracts';
import {
  AudioLines,
  BookOpenText,
  ExternalLink,
  MousePointerClick,
  PlayCircle,
  type LucideIcon,
} from 'lucide-react';

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

export const LESSON_TYPES: Record<LessonType, { label: string; icon: LucideIcon }> = {
  TEXT: { label: 'Reading', icon: BookOpenText },
  VIDEO: { label: 'Video', icon: PlayCircle },
  AUDIO: { label: 'Audio', icon: AudioLines },
  INTERACTIVE: { label: 'Exercise', icon: MousePointerClick },
  EXTERNAL_LINK: { label: 'External resource', icon: ExternalLink },
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  VIDEO: 'Video',
  AUDIO: 'Audio',
  CAPTIONS: 'Captions',
  TRANSCRIPT: 'Transcript',
  DOCUMENT: 'Document',
  LINK: 'Link',
};

export const STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: 'Draft',
  REVIEW: 'In review',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

/** "45 min", "5 h", "4 h 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Spoken form for screen readers and titles: "4 hours 30 minutes". */
export function formatDurationLong(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (rest || !hours) parts.push(`${rest} ${rest === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Accent colours per category. The three learning domains have their own tokens;
 * categories added later fall back to the neutral brand tint.
 */
const ACCENTS: Record<string, { tint: string; text: string; chip: string }> = {
  language: {
    tint: 'bg-domain-language-subtle',
    text: 'text-domain-language',
    chip: 'bg-surface text-primary-strong',
  },
  communication: {
    tint: 'bg-domain-communication-subtle',
    text: 'text-domain-communication',
    chip: 'bg-surface text-domain-communication',
  },
  leadership: {
    tint: 'bg-domain-leadership-subtle',
    text: 'text-domain-leadership',
    chip: 'bg-surface text-secondary',
  },
};

export function categoryAccent(slug: string) {
  return ACCENTS[slug] ?? { tint: 'bg-muted', text: 'text-fg-muted', chip: 'bg-surface text-fg' };
}
