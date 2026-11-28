'use client';

import { DURATION_FILTERS, type Category } from '@luminai/contracts';
import { ChevronDown, Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { LEVEL_LABELS } from '@/lib/course-format';

/** A compact select with its own chevron (the native arrow is hidden for a consistent look). */
function InlineSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-support">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="field-control h-10 w-auto cursor-pointer appearance-none pr-9 text-support font-medium"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted"
        />
      </span>
    </label>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center rounded-full border px-4 text-support font-medium transition-colors',
        pressed
          ? 'border-inverse bg-inverse text-on-inverse'
          : 'border-default bg-surface text-fg hover:bg-hover',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Search and filters. State lives in the URL (shareable, back-button friendly);
 * the server renders the results for each URL. Typing is debounced.
 */
export function CatalogFilters({
  categories,
  children,
}: {
  categories: Category[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const category = params.get('category') ?? '';
  const level = params.get('level') ?? '';
  const duration = params.get('duration') ?? '';

  function navigate(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    const search = next.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  }

  useEffect(() => () => clearTimeout(debounce.current), []);

  // Follow the URL when it changes from outside (a "Clear filters" link, back button).
  const urlQuery = params.get('q') ?? '';
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== query.trim()) setQuery(urlQuery);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => navigate({ q: value.trim() }), 300);
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            clearTimeout(debounce.current);
            navigate({ q: query.trim() });
          }}
        >
          <label className="relative block">
            <span className="sr-only">Search courses</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-fg-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search by skill, topic or goal"
              maxLength={100}
              className="field-control h-[52px] rounded-[14px] pr-12 pl-12 text-base [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  clearTimeout(debounce.current);
                  setQuery('');
                  navigate({ q: '' });
                }}
                className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </label>
        </form>

        <div className="flex flex-wrap items-center gap-2.5">
          <div role="group" aria-label="Category" className="flex flex-wrap gap-2.5">
            <Chip pressed={!category} onClick={() => navigate({ category: '' })}>
              All
            </Chip>
            {categories.map((item) => (
              <Chip
                key={item.id}
                pressed={category === item.slug}
                onClick={() => navigate({ category: category === item.slug ? '' : item.slug })}
              >
                {item.name}
              </Chip>
            ))}
          </div>
          <span aria-hidden className="mx-1.5 hidden h-7 w-px bg-default sm:block" />
          <InlineSelect
            label="Level"
            value={level}
            onChange={(next) => navigate({ level: next })}
            options={[
              { value: '', label: 'Any level' },
              ...Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          <InlineSelect
            label="Length"
            value={duration}
            onChange={(next) => navigate({ duration: next })}
            options={[
              { value: '', label: 'Any length' },
              ...Object.entries(DURATION_FILTERS).map(([value, filter]) => ({
                value,
                label: filter.label,
              })),
            ]}
          />
        </div>
      </div>
      <div
        aria-busy={pending || undefined}
        className={cn('transition-opacity duration-150', pending && 'opacity-60')}
      >
        {children}
      </div>
    </>
  );
}
