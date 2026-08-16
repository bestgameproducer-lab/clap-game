import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('invitation failures use only a server-HMAC client fingerprint', async () => {
  const [migration, auth] = await Promise.all([
    read('supabase/migrations/202608160001_limit_invitation_code_attempts.sql'),
    read('lib/auth.ts'),
  ]);
  assert.match(migration, /create table if not exists invitation_code_throttles/);
  assert.match(migration, /attempt_key text primary key/);
  assert.match(migration, /alter table invitation_code_throttles enable row level security/);
  assert.doesNotMatch(migration, /ip_address|user_agent|invitation_code text/);
  assert.match(auth, /getInvitationCodeAttemptKey/);
  assert.match(auth, /createHmac\('sha256', supabaseServiceRoleKey\)/);
  assert.match(auth, /invitation-code-v1/);
});

test('twenty consecutive attempts lock one client for fifteen minutes', async () => {
  const migration = await read('supabase/migrations/202608160001_limit_invitation_code_attempts.sql');
  assert.match(migration, /v_attempts:=least\(20,v_throttle\.attempt_count\+1\)/);
  assert.match(migration, /v_attempts>=20 then now\(\)\+interval '15 minutes'/);
  assert.match(migration, /return query select 'rate_limited'::text,900/);
  assert.match(migration, /delete from invitation_code_throttles where updated_at<now\(\)-interval '1 day'/);
});

test('registration consumes before roster lookup and clears only after success', async () => {
  const [route, data] = await Promise.all([
    read('app/api/registration/guests/route.ts'),
    read('lib/data/registration.ts'),
  ]);
  const consume = route.indexOf('const attempt = await consumeInvitationCodeAttempt');
  const lookup = route.indexOf('const result = await listRegistrationGuests');
  const clear = route.indexOf('await clearInvitationCodeAttempts', lookup);
  assert.ok(consume >= 0 && lookup > consume && clear > lookup);
  assert.match(route, /getInvitationCodeAttemptKey\(request\)/);
  assert.match(route, /new ApiError\(429,/);
  assert.match(route, /Retry-After/);
  assert.match(data, /rpc\('consume_invitation_code_attempt'/);
  assert.match(data, /rpc\('clear_invitation_code_attempts'/);
});
