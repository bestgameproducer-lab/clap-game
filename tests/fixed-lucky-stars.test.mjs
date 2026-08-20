import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608160004_fix_lucky_stars_and_guest_task_flow.sql', import.meta.url);
const namingMigrationUrl = new URL('../supabase/migrations/202608200001_trickster_camouflage_and_lonely_cupid_steal.sql', import.meta.url);
const currentRulesUrl = new URL('../supabase/migrations/202608200002_bouquet_lucky_and_double_verdict.sql', import.meta.url);

test('Feifei and Louise keep the two fixed Cupid lucky powers in act two', async () => {
  const [migration, namingMigration] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(namingMigrationUrl, 'utf8'),
  ]);
  assert.match(migration, /lower\(g\.login_name\)='feifei xie'/);
  assert.match(migration, /lower\(g\.login_name\)='luyi sun'/);
  assert.match(migration, /p\.super_lucky and lower\(g\.login_name\) in\('feifei xie','luyi sun'\)/);
  assert.match(migration, /mission_code='P2-LUCKY-001'/);
  assert.match(migration, /fixed_first_act_lucky/);
  assert.match(migration, /initial_lucky_bonus',2/);
  assert.match(namingMigration, /where mission_code='P2-LUCKY-001'/);
  assert.match(namingMigration, /title='超级幸运星'/);
  assert.match(namingMigration, /第一阶段积分快照 \+ 2/);
});

test('live repair preserves unfinished banquet work and refuses unsafe reassignment', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /fixed_lucky_manual_task_already_started/);
  assert.match(migration, /previous_lucky_nonzero_reward_requires_manual_review/);
  assert.match(migration, /status<>'assigned' or completion_note<>'' or evidence_path is not null/);
  assert.doesNotMatch(migration, /delete from assignments|delete from points_ledger|truncate/);
});

test('current allocation gives Feifei and Louise identical primary Super Lucky cards', async () => {
  const migration = await readFile(currentRulesUrl, 'utf8');
  assert.match(migration, /select g\.id,g\.team,'SUPER_LUCKY',false,true,false/);
  assert.match(migration, /lower\(g\.login_name\) in\('feifei xie','luyi sun'\)/);
  assert.match(migration, /primary_mission='SUPER_LUCKY'[\s\S]*<>2/);
  assert.match(migration, /phase_two_profiles\)<>20/);
  assert.match(migration, /mission_code like 'P2-%'\)<>20/);
  assert.match(migration, /v_task_count<>20/);
  assert.doesNotMatch(migration, /secondary_lucky|secondary lucky/i);
});
