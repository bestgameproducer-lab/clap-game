import crypto from 'crypto';
import 'server-only';

export const GUEST_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export function createGuestSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashGuestSessionToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
