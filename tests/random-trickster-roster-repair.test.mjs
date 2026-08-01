import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202608010002_restore_random_trickster_draw.sql', import.meta.url), 'utf8');
const admin = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const host = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');

test('default competitive profiles lock teams but leave the role random', () => {
  assert.match(migration, /role_locked=\(p_role='spy'\)/);
  assert.match(migration, /phase_two_eligible and drawn_at is null and role='guest' and role_locked/);
  assert.match(migration, /set role_locked=false/);
  assert.match(migration, /g\.role='spy'.*g\.role_locked/s);
  assert.match(admin, /随机身份（默认）/);
  assert.match(admin, /预设为恶作剧者/);
});

test('team settlement stays unavailable until every readiness condition passes', () => {
  assert.match(host, /data\.game\?\.stage !== 'group_game' \|\| !teamSettlementReady/);
  assert.match(admin, /data\.game\?\.stage !== 'group_game' \|\| !teamSettlementReady/);
  assert.match(admin, /setPendingFinaleAction\('settle-team-clues'\)/);
  assert.doesNotMatch(admin, /window\.confirm\(`确认结算团队挑战/);
});

test('the forward repair removes only ungranted unmistakable rehearsal clue placeholders', () => {
  assert.match(migration, /not exists\(select 1 from guest_clues/);
  for (const marker of ["c.title='11'", "c.title='22'", "c.title='33'", "c.title='任务线索'"]) {
    assert.ok(migration.includes(marker));
  }
  assert.doesNotMatch(migration, /truncate|drop table/i);
});
