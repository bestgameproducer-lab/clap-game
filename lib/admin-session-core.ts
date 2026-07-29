import crypto from 'crypto';

export function createOpaqueSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashOpaqueSessionToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
