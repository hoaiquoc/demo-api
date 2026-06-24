import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

type PasswordHash = {
  hash: string;
  salt: string;
  iterations: number;
};

const DEFAULT_ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export function hashPassword(password: string, input?: Partial<PasswordHash>): PasswordHash {
  const iterations = input?.iterations ?? DEFAULT_ITERATIONS;
  const salt = input?.salt ?? randomBytes(16).toString('base64');
  const derived = pbkdf2Sync(password, Buffer.from(salt, 'base64'), iterations, KEY_LENGTH, DIGEST).toString('base64');

  return {
    hash: derived,
    salt,
    iterations,
  };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
  const derived = pbkdf2Sync(password, Buffer.from(stored.salt, 'base64'), stored.iterations, KEY_LENGTH, DIGEST).toString(
    'base64',
  );

  try {
    return timingSafeEqual(Buffer.from(derived, 'base64'), Buffer.from(stored.hash, 'base64'));
  } catch {
    return false;
  }
}

