'use client';

import { useSyncExternalStore } from 'react';
import { timeZoneOptions } from './learning-options';

let cache: { value: string; label: string }[] | undefined;
const noop = () => () => {};

/**
 * Full time zone list on the client. The server render (and hydration) shows just the
 * current value, because the zone list differs between Node and browsers.
 */
export function useTimeZoneOptions(current: string): { value: string; label: string }[] {
  const all = useSyncExternalStore(
    noop,
    () => (cache ??= timeZoneOptions(current)),
    () => null,
  );
  if (!all) return [{ value: current, label: current }];
  return all.some((option) => option.value === current)
    ? all
    : [{ value: current, label: current }, ...all];
}
