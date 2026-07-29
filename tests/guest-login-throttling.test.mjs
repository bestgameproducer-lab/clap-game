import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290020_guest_login_throttling.sql', import.meta.url);

test('guest PIN failures are persisted without storing a raw network address', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const auth = await readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8');
  assert.match(migration, /create table if not exists guest_login_throttles/);
  assert.match(migration, /attempt_key text primary key/);
  assert.match(migration, /alter table guest_login_throttles enable row level security/);
  assert.equal(migration.includes('ip_address'), false);
  assert.match(auth, /createHmac\('sha256', supabaseServiceRoleKey\)/);
  assert.match(auth, /x-vercel-forwarded-for/);
});

test('five consecutive wrong PINs lock only the hashed client and guest pair', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /v_failures:=least\(5,v_throttle\.failure_count\+1\)/);
  assert.match(migration, /v_failures>=5 then now\(\)\+interval '15 minutes'/);
  assert.match(migration, /'rate_limited'::text,900/);
  assert.match(migration, /delete from guest_login_throttles where attempt_key=p_attempt_key/);
});

test('registration route derives the throttle key server-side and maps lockout to 429', async () => {
  const route = await readFile(new URL('../app/api/registration/claim/route.ts', import.meta.url), 'utf8');
  const data = await readFile(new URL('../lib/data/registration.ts', import.meta.url), 'utf8');
  assert.match(route, /getGuestLoginAttemptKey\(request, loginName\)/);
  assert.match(data, /p_attempt_key: attemptKey/);
  assert.match(data, /new ApiError\(429,/);
  assert.match(data, /guest\.auth_status !== 'ok'/);
});

test('password reset also clears saved throttles', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /delete from guest_login_throttles where guest_id=p_guest_id/);
});
