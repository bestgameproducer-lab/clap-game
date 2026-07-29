import 'server-only';
import { getServerEnv } from './env';
import { SessionKind, signSessionToken, verifySessionToken } from './session-core';

export function signSession(kind: SessionKind, subject: string, lifetimeSeconds: number, now = Date.now()) {
  return signSessionToken(kind, subject, lifetimeSeconds, getServerEnv().sessionSecret, now);
}

export function verifySession(token: string | null | undefined, expectedKind: SessionKind, now = Date.now()) {
  return verifySessionToken(token, expectedKind, getServerEnv().sessionSecret, now);
}
