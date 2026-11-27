import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@luminai/contracts';

// A short blocklist of the most common passwords that pass the length rule.
// Replace with a breached-password check (e.g. k-anonymity range API) before launch.
const COMMON_PASSWORDS = new Set([
  '123456789012',
  'password1234',
  'passwordpassword',
  'qwertyuiopas',
  'iloveyou1234',
  'administrator',
  'letmein12345',
  'welcome12345',
  '1234567890123',
  'aaaaaaaaaaaa',
]);

export interface PasswordPolicyResult {
  ok: boolean;
  message?: string;
}

/**
 * Server-side password rules (NIST SP 800-63B style): length, not a common
 * password, not the email address. No composition rules.
 */
export function checkPasswordPolicy(password: string, email: string): PasswordPolicyResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `Use at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `Use at most ${PASSWORD_MAX_LENGTH} characters.` };
  }
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || /^(.)\1+$/.test(password)) {
    return { ok: false, message: 'This password is too common. Choose something harder to guess.' };
  }
  const localPart = email.split('@')[0] ?? '';
  if (
    lowered === email.toLowerCase() ||
    (localPart.length >= 4 && lowered.includes(localPart.toLowerCase()))
  ) {
    return { ok: false, message: "Don't include your email address in your password." };
  }
  return { ok: true };
}
