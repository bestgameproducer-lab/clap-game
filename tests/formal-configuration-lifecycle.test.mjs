import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('formal configuration is manifest-owned and freezes when registration starts', async () => {
  const sql = await readFile(
    new URL('supabase/migrations/202608140007_lock_formal_configuration_after_start.sql', root),
    'utf8',
  );

  assert.match(sql, /registration_open[\s\S]*stage<>'registration'/);
  assert.match(sql, /claimed_at is not null or drawn_at is not null/);
  assert.match(sql, /message='formal_team_locked'/);
  assert.match(sql, /message='formal_story_cast_locked'/);
  assert.match(sql, /message='formal_phase_two_profile_locked'/);
  assert.match(sql, /role_locked=\(p_role='spy'\)/);
  assert.match(sql, /trim\(p_team\)<>v_guest\.team/);
  assert.match(sql, /perform assert_formal_configuration_editable\(\)/);
  assert.match(sql, /revoke all on function configure_guest_game_profile/);
});

test('admin UI explains formal ownership instead of exposing unsafe live editors', async () => {
  const page = await readFile(new URL('app/admin/page.tsx', root), 'utf8');
  const data = await readFile(new URL('lib/data/admin.ts', root), 'utf8');

  assert.match(page, /正式剧情职务由名单固定/);
  assert.match(page, /第二轮由流程统一派发/);
  assert.match(page, /名单已经进入使用，身份预设已锁定/);
  assert.match(page, /选择“随机身份”会取消预设/);
  assert.match(data, /formal_configuration_locked/);
  assert.match(data, /formal_phase_two_profile_locked/);
});
