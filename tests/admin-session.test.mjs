import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createOpaqueSessionToken, hashOpaqueSessionToken } from '../lib/admin-session-core.ts';

test('creates high-entropy opaque staff tokens and stable one-way hashes', () => {
  const first = createOpaqueSessionToken();
  const second = createOpaqueSessionToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 43);
  assert.match(hashOpaqueSessionToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashOpaqueSessionToken(first), hashOpaqueSessionToken(first));
  assert.notEqual(hashOpaqueSessionToken(first), first);
});

test('administrator authorization requires an active database session', async () => {
  const source = await readFile(new URL('../lib/data/admin-session.ts', import.meta.url), 'utf8');
  assert.match(source, /from\('admin_sessions'\)/);
  assert.match(source, /is\('revoked_at', null\)/);
  assert.match(source, /gt\('expires_at'/);
  const auth = await readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8');
  assert.match(auth, /await verifyAdminSession\(token\)/);
  assert.doesNotMatch(auth, /verifySession\(/);
});

test('staff login and logout are same-origin, revocable, and audited', async () => {
  const login = await readFile(new URL('../app/api/admin-login/route.ts', import.meta.url), 'utf8');
  const logout = await readFile(new URL('../app/api/admin-logout/route.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/202607290013_revocable_admin_sessions.sql', import.meta.url), 'utf8');
  assert.match(login, /assertSameOrigin\(request\)/);
  assert.match(login, /await createAdminSession\(\)/);
  assert.match(logout, /assertSameOrigin\(request\)/);
  assert.match(logout, /await revokeAdminSession\(token, actor\)/);
  assert.match(migration, /alter table admin_sessions enable row level security/);
  assert.match(migration, /'admin_session\.create'/);
  assert.match(migration, /'admin_session\.revoke'/);
  assert.match(migration, /revoke all on admin_sessions from public, anon, authenticated/);
});

test('all staff consoles expose the shared safe logout control', async () => {
  for (const path of ['../app/admin/page.tsx', '../app/host/page.tsx', '../app/station/page.tsx']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /<StaffLogoutButton\/>/);
  }
});
