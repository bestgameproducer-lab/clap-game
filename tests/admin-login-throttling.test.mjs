import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607290032_admin_login_throttling.sql', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/admin-login/route.ts', import.meta.url), 'utf8');
const auth = await readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8');
const data = await readFile(new URL('../lib/data/admin-login.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

test('administrator login throttles store only a server-HMAC attempt key', () => {
  assert.match(migration, /create table if not exists admin_login_throttles/);
  assert.match(migration, /attempt_key text primary key/);
  assert.match(migration, /attempt_key ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /alter table admin_login_throttles enable row level security/);
  assert.match(migration, /revoke all on table admin_login_throttles from public,anon,authenticated/);
  for (const rawField of ['ip_address', 'user_agent', 'password text', 'password_hash', 'supplied_password']) {
    assert.equal(migration.includes(rawField), false);
  }
  assert.match(auth, /createHmac\('sha256', supabaseServiceRoleKey\)/);
  assert.match(auth, /admin-login-v1\\n\$\{firstClientAddress\(request\)\}\\n\$\{userAgent\}/);
});

test('five failures lock one fingerprint for fifteen minutes atomically', () => {
  const body = migration.slice(migration.indexOf('create or replace function record_admin_login_attempt'));
  assert.match(body, /pg_advisory_xact_lock\(hashtext\('admin-login:' \|\| p_attempt_key\)\)/);
  assert.match(body, /failure_count=v_failures/);
  assert.match(body, /v_failures>=5 then now\(\)\+interval '15 minutes'/);
  assert.match(body, /return query select 'rate_limited'::text,900/);
  assert.match(body, /if p_password_valid then\s+delete from admin_login_throttles/);
  assert.match(body, /grant execute on function record_admin_login_attempt\(text,boolean\) to service_role/);
});

test('admin login returns a retry window and creates no session while locked', () => {
  const throttleCall = route.indexOf('await recordAdminLoginAttempt');
  const sessionCall = route.indexOf('await createAdminSession');
  assert.ok(throttleCall >= 0 && throttleCall < sessionCall);
  assert.match(route, /getAdminLoginAttemptKey\(request\)/);
  assert.match(route, /attempt\.status === 'rate_limited'/);
  assert.match(route, /status: 429/);
  assert.match(route, /headers\.set\('Retry-After'/);
  assert.match(data, /rpc\('record_admin_login_attempt'/);
  assert.match(page, /连续输错五次后，该设备暂停登录十五分钟/);
});
