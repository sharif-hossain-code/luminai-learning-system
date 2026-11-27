import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './identity.js';

// A short blocklist of the most common passwords that pass the length rule.
// Replace with a breached-password check (e.g. a k-anonymity range API) before launch.
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

export interface PasswordContext {
  email?: string | null;
  name?: string | null;
}

export interface PasswordEvaluation {
  ok: boolean;
  /** One entry per rule shown to the learner, in display order. */
  rules: { longEnough: boolean; notCommon: boolean; notPersonal: boolean };
  /** First failing rule, worded for the learner. */
  message?: string;
  /** 0 (empty) to 4 (strong), for the strength meter only. Never a gate on its own. */
  strength: 0 | 1 | 2 | 3 | 4;
}

function personalParts({ email, name }: PasswordContext): string[] {
  const parts: string[] = [];
  const localPart = email?.split('@')[0];
  if (localPart) parts.push(localPart);
  for (const word of name?.split(/\s+/) ?? []) parts.push(word);
  return parts.map((part) => part.toLowerCase()).filter((part) => part.length >= 4);
}

/**
 * Password rules (NIST SP 800-63B style): length, not a common password, not the
 * learner's name or email. No composition rules. The API enforces this; the web
 * app uses the same function to show the rules live.
 */
export function evaluatePassword(
  password: string,
  context: PasswordContext = {},
): PasswordEvaluation {
  const lowered = password.toLowerCase();
  const longEnough =
    password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
  const notCommon =
    password.length > 0 && !COMMON_PASSWORDS.has(lowered) && !/^(.)\1+$/.test(password);
  const fullEmail = context.email?.toLowerCase();
  const notPersonal =
    password.length > 0 &&
    lowered !== fullEmail &&
    !personalParts(context).some((part) => lowered.includes(part));

  let message: string | undefined;
  if (password.length < PASSWORD_MIN_LENGTH)
    message = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  else if (password.length > PASSWORD_MAX_LENGTH)
    message = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  else if (!notCommon) message = 'This password is too common. Choose something harder to guess.';
  else if (!notPersonal) message = "Don't include your name or email address in your password.";

  const ok = longEnough && notCommon && notPersonal;
  let strength: PasswordEvaluation['strength'] = 0;
  if (password.length > 0) {
    if (!ok) strength = 1;
    else {
      const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) =>
        re.test(password),
      ).length;
      const unique = new Set(password).size;
      strength =
        password.length >= 16 && unique >= 8 ? 4 : classes >= 3 || password.length >= 14 ? 3 : 2;
    }
  }

  return {
    ok,
    rules: { longEnough, notCommon, notPersonal },
    ...(message ? { message } : {}),
    strength,
  };
}
