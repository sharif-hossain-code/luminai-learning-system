import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-id.js';

const requestWith = (headers: Record<string, string | string[]>) =>
  ({ headers }) as unknown as IncomingMessage;

describe('resolveRequestId', () => {
  it('reuses a safe incoming request ID', () => {
    expect(resolveRequestId(requestWith({ 'x-request-id': 'req_abc12345' }))).toBe('req_abc12345');
  });

  it('generates an ID when none is supplied', () => {
    expect(resolveRequestId(requestWith({}))).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it.each([
    ['contains unsafe characters', 'abc<script>12345'],
    ['is too long', 'a'.repeat(65)],
    ['is too short', 'abc'],
  ])('replaces an incoming ID that %s', (_reason, value) => {
    expect(resolveRequestId(requestWith({ 'x-request-id': value }))).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it('ignores repeated headers', () => {
    expect(
      resolveRequestId(requestWith({ 'x-request-id': ['req_aaaaaaaa', 'req_bbbbbbbb'] })),
    ).toMatch(/^req_[0-9a-f]{32}$/);
  });
});
