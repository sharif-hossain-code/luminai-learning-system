import { BookOpen, Mic, Network, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { categoryAccent } from '@/lib/course-format';

const ICONS: Record<string, LucideIcon> = {
  language: BookOpen,
  communication: Mic,
  leadership: Network,
};

/** Placeholder cover art until course covers are uploaded: the domain's icon on its tint. */
export function DomainArt({
  slug,
  className,
  iconClassName,
}: {
  slug: string;
  className?: string;
  iconClassName?: string;
}) {
  const Icon = ICONS[slug] ?? BookOpen;
  const accent = categoryAccent(slug);
  return (
    <div aria-hidden className={cn('flex items-center justify-center', accent.tint, className)}>
      <Icon className={cn('size-[72px]', accent.text, iconClassName)} strokeWidth={1.5} />
    </div>
  );
}
