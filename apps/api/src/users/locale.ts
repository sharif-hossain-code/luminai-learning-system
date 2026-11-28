let timeZones: Set<string> | undefined;

/** True for IANA time zone names this runtime knows (plus "UTC"). */
export function isValidTimeZone(value: string): boolean {
  timeZones ??= new Set([...Intl.supportedValuesOf('timeZone'), 'UTC', 'Etc/UTC']);
  return timeZones.has(value);
}

/** Canonical BCP 47 tag ("en-gb" → "en-GB"), or null if the tag is invalid. */
export function canonicalLocale(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return null;
  }
}
