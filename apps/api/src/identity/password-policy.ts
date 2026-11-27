import { evaluatePassword, type PasswordContext } from '@luminai/contracts';

export interface PasswordPolicyResult {
  ok: boolean;
  message?: string;
}

/** Server-side password rules. The rules live in @luminai/contracts so the web app shows the same ones. */
export function checkPasswordPolicy(
  password: string,
  email: string,
  name?: string | null,
): PasswordPolicyResult {
  const context: PasswordContext = { email, name: name ?? null };
  const result = evaluatePassword(password, context);
  return result.ok
    ? { ok: true }
    : { ok: false, ...(result.message ? { message: result.message } : {}) };
}
