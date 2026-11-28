import type { z } from 'zod';

/** First message per top-level field from a failed Zod parse. */
export function zodFieldErrors<F extends string>(error: z.ZodError): Partial<Record<F, string>> {
  const result: Partial<Record<F, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !(field in result)) result[field as F] = issue.message;
  }
  return result;
}
