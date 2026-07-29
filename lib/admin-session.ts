import 'server-only';
import { createOpaqueSessionToken, hashOpaqueSessionToken } from './admin-session-core';

export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;

export function createAdminSessionToken() {
  return createOpaqueSessionToken();
}

export function hashAdminSessionToken(token: string) {
  return hashOpaqueSessionToken(token);
}
