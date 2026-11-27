import Link from 'next/link';
import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-[34px] items-center justify-center rounded-[10px] bg-brand-mark',
        className,
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
      </svg>
    </span>
  );
}

export function Logo({
  href = '/',
  className,
  inverse = false,
}: {
  href?: string;
  className?: string;
  inverse?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex w-fit items-center gap-2.5',
        inverse ? 'text-on-inverse' : 'text-fg',
        className,
      )}
    >
      <LogoMark />
      <span className="text-xl font-bold tracking-tight">Luminai</span>
    </Link>
  );
}
