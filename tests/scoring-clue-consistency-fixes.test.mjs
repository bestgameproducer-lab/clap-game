import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = await read(
  'supabase/migrations/202608140005_close_scoring_clue_consistency_gaps.sql',
);

test('the final approval ACL closes the canonical primitive and asserts the run-scoped entry point', () => {
  assert.match(
    migration,
    /revoke all on function approve_assignment\(uuid,text,text\)[\s\S]*?from public,anon,authenticated,service_role/,
  );
  assert.match(
    migration,
    /grant execute on function approve_assignment_with_verification_for_run\([\s\S]*?uuid,text,text,uuid[\s\S]*?\) to service_role/,
  );
  assert.match(migration, /has_function_privilege\([\s\S]*?'service_role'[\s\S]*?approve_assignment\(uuid,text,text\)'[\s\S]*?'EXECUTE'/);
  assert.match(migration, /message='canonical_approval_acl_open'/);
  assert.match(migration, /message='run_scoped_approval_acl_missing'/);
});

test('system completion maps each mechanic to one exact official first-act mission', () => {
  const complete = migration.slice(
    migration.indexOf('create or replace function complete_system_mission_before_final_lock'),
    migration.indexOf('create or replace function settle_phase_two_team_clues'),
  );
  for (const [mechanic, missionCode] of [
    ['HEART_MATCH', 'P1-HEART-001'],
    ['STAR_MATCH', 'P1-STAR-001'],
    ['TRICKSTER_SIGNAL', 'P1-TRICKSTER-001'],
    ['INSTANT_BONUS', 'P1-BONUS-001'],
  ]) {
    assert.match(complete, new RegExp(`when '${mechanic}' then '${missionCode}'`));
  }
  assert.match(complete, /t\.mission_code=v_mission_code/);
  assert.match(complete, /is_official_wedding_mission_code\(t\.mission_code\)/);
  assert.match(complete, /t\.stage='task_round_1'/);
  assert.match(complete, /t\.formal_allowed and t\.active/);
  assert.match(complete, /a\.status in\('assigned','rejected','submitted'\)/);
  assert.match(complete, /v_mission_code='P1-TRICKSTER-001' or a\.is_initial/);
  assert.match(complete, /message='invalid_system_mission_mechanic'/);
  assert.doesNotMatch(complete, /t\.mechanic=p_mechanic and a\.status/);
});

test('team clues and Guiding Star use one positive-score joint-first rule', async () => {
  const [manifest, spec, adminPage, captainMigration] = await Promise.all([
    read('lib/official-task-manifest.ts'),
    read('docs/phase-two-task-spec.md'),
    read('app/admin/page.tsx'),
    read('supabase/migrations/202608140002_fix_copy_score_settlement_scope.sql'),
  ]);
  const settlement = migration.slice(
    migration.indexOf('create or replace function settle_phase_two_team_clues'),
    migration.indexOf('update tasks set'),
  );
  assert.match(settlement, /v_first_place:=v_team\.top_score>0 and v_team\.score=v_team\.top_score/);
  assert.match(settlement, /v_clue_count:=case when v_first_place then 2 else 1 end/);
  assert.match(settlement, /when v_team\.top_score<=0 then null/);
  assert.match(settlement, /'first_place',v_first_place/);
  assert.match(settlement, /'ranking_rule','positive_top_score_joint_first'/);
  assert.match(captainMigration, /coalesce\(v_top_team_score,0\)>0/);
  for (const source of [manifest, spec, adminPage]) {
    assert.match(source, /0 分|0:0/);
    assert.match(source, /并列第一/);
  }
});

test('settled clues cannot be deactivated and remain available for exact recovery', async () => {
  const [adminData, adminPage] = await Promise.all([
    read('lib/data/admin.ts'),
    read('app/admin/page.tsx'),
  ]);
  const deactivate = migration.slice(
    migration.indexOf('create or replace function deactivate_game_clue'),
    migration.indexOf('-- Defence in depth'),
  );
  assert.match(deactivate, /a\.action='phase_two\.team_clues_settle'/);
  assert.match(deactivate, /a\.details->'clue_ids'/);
  assert.match(deactivate, /message='settled_clue_locked'/);
  const trigger = migration.slice(
    migration.indexOf('create or replace function guard_granted_clue_content'),
    migration.indexOf('-- The unscoped approval primitive'),
  );
  assert.match(trigger, /exists\(select 1 from guest_clues where clue_id=old\.id\)/);
  assert.match(trigger, /if old\.active and not new\.active/);
  assert.match(trigger, /current_setting\('wedding\.rehearsal_reset',true\)='on'/);
  assert.match(adminData, /settled_clue_locked/);
  assert.match(adminPage, /settledClueIdSet\.has\(libraryClue\.id\)/);
  assert.match(adminPage, /本轮已发放，需保持启用/);
});
