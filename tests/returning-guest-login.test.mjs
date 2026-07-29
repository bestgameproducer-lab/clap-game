import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290034_returning_guest_login.sql', import.meta.url);

test('closed registration lists only returning guests after invitation validation', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const list = migration.slice(migration.indexOf('create or replace function registration_guest_list'), migration.indexOf('drop function if exists claim_guest_by_login'));
  assert.match(list, /crypt\(p_invitation_code,v_state\.invitation_code_hash\)/);
  assert.match(list, /v_state\.registration_open or g\.claim_code_hash is not null/);
  assert.equal(list.includes("message='registration_closed'"), false);
  assert.match(list, /where g\.active/);
});

test('closed registration blocks only first-time PIN creation', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const claim = migration.slice(migration.indexOf('create function claim_guest_by_login'));
  const firstTimeGuard = claim.indexOf('if v_guest.claim_code_hash is null then');
  const closedGuard = claim.indexOf('if not v_state.registration_open then');
  const returningBranch = claim.indexOf('else', closedGuard);
  assert.ok(firstTimeGuard >= 0 && closedGuard > firstTimeGuard && returningBranch > closedGuard);
  assert.match(claim, /select \* into v_state from game_state where game_state\.id=1 for share/);
  assert.match(claim, /insert into guest_sessions\(guest_id,token_hash,expires_at\)/);
  assert.match(claim, /guest_login_throttles/);
});

test('registration API exposes only the RPC-permitted roster and mobile copy explains returning login', async () => {
  const [data, route, page] = await Promise.all([
    readFile(new URL('../lib/data/registration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/registration/guests/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(data, /const permittedIds = \(permittedGuests \?\? \[\]\)\.map/);
  assert.match(data, /\.in\('id', permittedIds\)/);
  assert.match(data, /registrationOpen: game\.registration_open/);
  assert.match(route, /return noStoreJson\(result\)/);
  assert.match(page, /新宾客注册已结束；已设置密码的宾客仍可登录/);
});
