import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { RequestValidationError } from './app-error.js';

function pathToString(path: StandardSchemaV1.Issue['path']): string {
  return (path ?? [])
    .map((segment) =>
      typeof segment === 'object' && segment !== null ? String(segment.key) : String(segment),
    )
    .join('.');
}

/**
 * Validates every `@Body({ schema })`, `@Query({ schema })` and `@Param(..., { schema })`
 * with its Zod schema and returns the parsed value. Failures become 422 with field errors.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) =>
      new RequestValidationError(
        issues.map((issue) => ({ field: pathToString(issue.path), message: issue.message })),
      ),
  });
}
