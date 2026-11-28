import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Argon2id with the OWASP-recommended baseline (19 MiB, 2 iterations, 1 lane).
 * Raise the cost when production hardware allows; old hashes upgrade on next sign-in.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordHasher {
  // Compared against when the email is unknown, so sign-in takes the same time
  // whether or not the account exists.
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Spends the same effort as a real verification. Always resolves to false. */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-equalisation');
    await this.verify(await this.dummyHash, password);
    return false;
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }
}
