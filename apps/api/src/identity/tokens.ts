import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, URL-safe. Sent to the user; never stored. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 of a high-entropy token. A fast hash is appropriate here (unlike
 * passwords) because the input is 256 bits of randomness, not a guessable secret.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
