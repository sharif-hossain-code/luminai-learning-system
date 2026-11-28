import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { errorEnvelopeSchema } from '@luminai/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

const filter = new AllExceptionsFilter();

describe('AllExceptionsFilter.toEnvelope', () => {
  it('maps a 404 to RESOURCE_NOT_FOUND with the request ID', () => {
    const { status, body } = filter.toEnvelope(new NotFoundException(), 'req_test1234');
    expect(status).toBe(404);
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.error.requestId).toBe('req_test1234');
    expect(errorEnvelopeSchema.safeParse(body).success).toBe(true);
  });

  it('keeps deliberate 4xx messages', () => {
    const { body } = filter.toEnvelope(
      new ForbiddenException('Course is not published.'),
      'req_test1234',
    );
    expect(body.error).toMatchObject({ code: 'FORBIDDEN', message: 'Course is not published.' });
  });

  it('hides the details of unexpected errors', () => {
    const { status, body } = filter.toEnvelope(
      new Error('connect ECONNREFUSED postgres://admin:hunter2@db:5432'),
      'req_test1234',
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('hides messages on 5xx HTTP exceptions too', () => {
    const { body } = filter.toEnvelope(
      new InternalServerErrorException('SQL syntax error near users'),
      'req_x1234567',
    );
    expect(body.error.message).not.toContain('SQL');
  });

  it('turns schema validation errors into field errors', () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'nope' });
    if (result.success) throw new Error('expected validation to fail');
    const { status, body } = filter.toEnvelope(result.error, 'req_test1234');
    expect(status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.fieldErrors).toHaveLength(1);
    expect(body.error.fieldErrors[0]?.field).toBe('email');
  });

  it('maps framework client errors such as malformed JSON to BAD_REQUEST', () => {
    const fastifyError = Object.assign(new Error('Unexpected token'), { statusCode: 400 });
    const { status, body } = filter.toEnvelope(fastifyError, 'req_test1234');
    expect(status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).not.toContain('Unexpected token');
  });
});
