import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema, readinessResponseSchema } from './index.js';

describe('contracts', () => {
  it('accepts a well-formed error envelope', () => {
    const parsed = errorEnvelopeSchema.safeParse({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Not found.',
        requestId: 'req_1',
        fieldErrors: [],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an error envelope without a request ID', () => {
    const parsed = errorEnvelopeSchema.safeParse({
      error: { code: 'INTERNAL_ERROR', message: 'Oops.', fieldErrors: [] },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects readiness payloads with unknown status values', () => {
    const parsed = readinessResponseSchema.safeParse({
      status: 'ready',
      checks: { database: 'maybe', redis: 'up' },
    });
    expect(parsed.success).toBe(false);
  });
});
