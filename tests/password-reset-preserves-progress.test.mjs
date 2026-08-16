import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('guest password reset clears authentication only', async () => {
  const [passwordReset, migration, adminPage] = await Promise.all([
    read('supabase/migrations/202607290020_guest_login_throttling.sql'),
    read('supabase/migrations/202608160002_preserve_game_progress_on_password_reset.sql'),
    read('app/admin/page.tsx'),
  ]);

  const resetFunction = passwordReset.slice(
    passwordReset.indexOf('create or replace function reset_guest_claim'),
    passwordReset.indexOf('revoke all on function reset_guest_claim'),
  );
  assert.match(resetFunction, /claimed_at=null,claim_code_hash=null/);
  assert.match(resetFunction, /update guest_sessions set revoked_at=now\(\)/);
  for (const gameplayField of ['drawn_at', 'team=', 'role=', 'points=', 'avatar_path', 'assignments']) {
    assert.doesNotMatch(resetFunction, new RegExp(gameplayField));
  }

  const trigger = migration.slice(migration.indexOf('create or replace function reset_honor_special_card_with_claim'));
  assert.match(trigger, /wedding\.rehearsal_reset[\s\S]*new\.special_card_revealed_at=null/);
  assert.match(trigger, /else[\s\S]*new\.special_card_revealed_at=old\.special_card_revealed_at/);
  assert.doesNotMatch(trigger, /results_published_at|result_rewards/);
  assert.match(adminPage, /不会清除抽卡、任务、积分或头像/);
});
