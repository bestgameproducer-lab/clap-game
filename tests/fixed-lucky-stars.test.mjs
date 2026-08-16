import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608160004_fix_lucky_stars_and_guest_task_flow.sql', import.meta.url);

test('Feifei and Louise keep the two fixed Cupid lucky powers in act two', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /lower\(g\.login_name\)='feifei xie'/);
  assert.match(migration, /lower\(g\.login_name\)='luyi sun'/);
  assert.match(migration, /p\.super_lucky and lower\(g\.login_name\) in\('feifei xie','luyi sun'\)/);
  assert.match(migration, /mission_code='P2-LUCKY-001'/);
  assert.match(migration, /fixed_first_act_lucky/);
  assert.match(migration, /initial_lucky_bonus',2/);
});

test('live repair preserves unfinished banquet work and refuses unsafe reassignment', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /fixed_lucky_manual_task_already_started/);
  assert.match(migration, /previous_lucky_nonzero_reward_requires_manual_review/);
  assert.match(migration, /status<>'assigned' or completion_note<>'' or evidence_path is not null/);
  assert.doesNotMatch(migration, /delete from assignments|delete from points_ledger|truncate/);
});

test('future allocation keeps twenty primary profiles plus Louise secondary lucky card', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /v_task_count:=v_task_count\+1/);
  assert.match(migration, /g\.team=v_team[\s\S]*lower\(g\.login_name\)<>'feifei xie'/);
  assert.match(migration, /if v_count<>21 or not phase_two_official_assignment_set_complete\(\)/);
  assert.match(migration, /return 21/);
  assert.match(migration, /mission_code='P2-LUCKY-001'[\s\S]*lower\(g\.login_name\)='luyi sun'/);
  assert.match(migration, /phase_two_profiles\)<>20/);
  assert.match(migration, /mission_code like 'P2-%'\)<>21/);
  assert.match(migration, /case when lower\(g\.login_name\)='luyi sun' then 2 else 1 end/);
});
