import { describe, expect, it } from 'vitest';
import { evaluatePassword } from './password-policy.js';

describe('evaluatePassword', () => {
  it('accepts a long passphrase', () => {
    const result = evaluatePassword('correct horse battery staple', { email: 'amina@example.com' });
    expect(result.ok).toBe(true);
    expect(result.strength).toBeGreaterThanOrEqual(3);
  });

  it('rejects short, common and repeated passwords', () => {
    expect(evaluatePassword('short').rules.longEnough).toBe(false);
    expect(evaluatePassword('Password1234').rules.notCommon).toBe(false);
    expect(evaluatePassword('zzzzzzzzzzzzzz').rules.notCommon).toBe(false);
  });

  it("rejects passwords containing the learner's email or name", () => {
    expect(
      evaluatePassword('amina.rahman-2026!', { email: 'amina.rahman@example.com' }).rules
        .notPersonal,
    ).toBe(false);
    const byName = evaluatePassword('my rahman password', { name: 'Amina Rahman' });
    expect(byName.ok).toBe(false);
    expect(byName.message).toMatch(/name or email/);
  });

  it('reports strength 0 for an empty password', () => {
    expect(evaluatePassword('').strength).toBe(0);
  });
});
