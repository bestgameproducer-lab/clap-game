import assert from 'node:assert/strict';
import test from 'node:test';
import { signSessionToken, verifySessionToken } from '../lib/session-core.ts';

const secret = 'a-test-secret-that-is-longer-than-32-characters';
const now = Date.UTC(2026, 6, 28);

test('accepts a valid session with the expected kind', () => {
  const token = signSessionToken('guest', 'guest-123', 300, secret, now);
  assert.equal(verifySessionToken(token, 'guest', secret, now + 1_000), 'guest-123');
});

test('rejects tampered and wrong-kind sessions', () => {
  const token = signSessionToken('guest', 'guest-123', 300, secret, now);
  assert.equal(verifySessionToken(`${token}x`, 'guest', secret, now), null);
  assert.equal(verifySessionToken(token, 'admin', secret, now), null);
});

test('rejects expired sessions', () => {
  const token = signSessionToken('admin', 'shared-admin', 10, secret, now);
  assert.equal(verifySessionToken(token, 'admin', secret, now + 11_000), null);
});
