/**
 * Email jobs carry only IDs. Tokens are created by the processor, so no secret
 * or personal data ever sits in Redis.
 */
export type EmailJob =
  | { type: 'verify-email'; userId: string }
  | { type: 'password-reset'; userId: string }
  | { type: 'account-exists'; userId: string }
  | { type: 'password-changed'; userId: string };

export const EMAIL_QUEUE = 'email';
