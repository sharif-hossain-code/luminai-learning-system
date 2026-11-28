/** Canonical form used for uniqueness and sign-in: Unicode NFC, trimmed, lower-case. */
export function normalizeEmail(email: string): string {
  return email.normalize('NFC').trim().toLowerCase();
}
