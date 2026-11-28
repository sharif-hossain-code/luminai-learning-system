const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/Windows NT/, 'Windows'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/**
 * Coarse, human-readable device label ("Chrome on Windows") for the sessions
 * list. Only this summary is stored, not the full user-agent string.
 */
export function describeDevice(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown device';
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}
