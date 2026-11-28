import { cn } from '@/lib/cn';

/** A course progress bar with an accessible value. Turns green at 100%. */
export function ProgressBar({
  percent,
  label = 'Course progress',
  className,
  size = 'md',
}: {
  percent: number;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${value}% complete`}
      className={cn(
        'overflow-hidden rounded-full bg-subtle',
        size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
    >
      <span
        className={cn(
          'block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none',
          value === 100 ? 'bg-success' : 'bg-primary',
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
