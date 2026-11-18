import { createHash, randomBytes } from 'node:crypto';

/** 256 bits aleatorios en base64url (RF-09 pide al menos 128). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
