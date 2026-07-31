import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isPlayerCode, normalizePlayerCode } from '../lib/player-code.ts';

const migrationUrl = new URL('../supabase/migrations/202607310025_random_player_codes.sql', import.meta.url);
const guestDataUrl = new URL('../lib/data/guest.ts', import.meta.url);
const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('short player codes are readable, normalized, and not sequential numbers', () => {
  assert.equal(normalizePlayerCode(' k7-m4 '), 'K7M4');
  assert.equal(isPlayerCode('K7M4'), true);
  assert.equal(isPlayerCode('ABCD'), false);
  assert.equal(isPlayerCode('2345'), false);
  for (const ambiguous of ['O7M4', 'I7M4', 'L7M4', 'K0M4', 'K1M4', 'P012']) {
    assert.equal(isPlayerCode(ambiguous), false, `${ambiguous} must be rejected`);
  }
});

test('the forward migration randomizes codes without changing guest identity or runtime records', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /v_alphabet constant text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'/);
  assert.match(migration, /v_candidate~'\[A-Z\]' and v_candidate~'\[2-9\]'/);
  assert.match(migration, /update guests set player_code=generate_readable_player_code\(\) where id=v_guest_id/);
  assert.match(migration, /guests_player_code_format_check/);
  assert.match(migration, /before insert or update of player_code on guests/);
  assert.doesNotMatch(migration, /update assignments|delete from assignments|update points_ledger|delete from player_relationships/);
});

test('authenticated code entry is rate limited and target errors do not enable enumeration', async () => {
  const [migration, data, page] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(guestDataUrl, 'utf8'),
    readFile(guestPageUrl, 'utf8'),
  ]);
  assert.match(migration, /create table if not exists player_code_attempt_throttles/);
  assert.match(migration, /if v_count>8 then/);
  assert.match(migration, /locked_until=v_now\+interval '10 minutes'/);
  assert.match(migration, /grant execute on function consume_player_code_attempt\(uuid\) to service_role/);
  assert.equal((data.match(/await consumePlayerCodeAttempt\(guestId\)/g) ?? []).length, 2);
  assert.match(data, /编号无效或不适合这项任务/);
  assert.doesNotMatch(data, /没有找到这个玩家编号/);
  assert.match(page, /placeholder="例如 K7M4"/);
  assert.match(page, /normalizePlayerCode\(event\.target\.value\)/);
  assert.match(page, /isPlayerCode\(connectionTargetCode\)/);
  assert.doesNotMatch(page, /\^P\[0-9\]/);
});
