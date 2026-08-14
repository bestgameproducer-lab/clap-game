import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the phase-two allocator always assigns one extra vote to each competitive team', async () => {
  const migration = await read('supabase/migrations/202608130032_make_phase_two_allocator_team_safe.sql');
  const extraVoteSection = migration.slice(
    migration.indexOf('-- One extra-vote profile'),
    migration.indexOf('insert into phase_two_profiles(\n    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,\n    interaction_theme,phase_one_points_snapshot,updated_at\n  )\n  select g.id,g.team,\'SUPER_LUCKY\''),
  );

  assert.match(extraVoteSection, /foreach v_team in array array\['海岛组','沙漠组'\] loop/);
  assert.match(extraVoteSection, /and g\.team=v_team/);
  assert.match(extraVoteSection, /'EXTRA_VOTE',true,false,false/);
  assert.doesNotMatch(extraVoteSection, /limit 2/);
  assert.match(migration, /where p\.team=expected\.team and p\.primary_mission='EXTRA_VOTE'\)<>1/);
});

test('special second-act roles are derived from the first-act symbol result, not arbitrary presets', async () => {
  const [allocator, originBoundary, stageMachine] = await Promise.all([
    read('supabase/migrations/202608130032_make_phase_two_allocator_team_safe.sql'),
    read('supabase/migrations/202608030002_pair_acceptance_and_result_freeze.sql'),
    read('supabase/migrations/202608130003_harden_phase_two_release_invariants.sql'),
  ]);

  assert.match(allocator, /case g\.unlocked_role[\s\S]*when 'LONELY_CUPID' then 'COPY_SCORE'[\s\S]*when 'GUIDING_STAR' then 'TEAM_CAPTAIN'/);
  assert.match(allocator, /g\.unlocked_role in\('CUPID_ALLIANCE','STAR_ALLIANCE','LONELY_CUPID','GUIDING_STAR'\)/);
  assert.match(originBoundary, /new\.primary_mission='TEAM_CAPTAIN'[\s\S]*s\.symbol='STAR' and s\.status='UNPAIRED_FINAL'/);
  assert.match(originBoundary, /new\.primary_mission='COPY_SCORE'[\s\S]*s\.symbol='HEART' and s\.status='UNPAIRED_FINAL'/);
  assert.match(stageMachine, /perform finalize_phase_one_content\(p_actor\)[\s\S]*v_phase_two_count:=unlock_phase_two_missions\(p_actor\)/);
});

test('phase-two release rejects incomplete assignments instead of moving the wedding forward', async () => {
  const [allocator, stageMachine] = await Promise.all([
    read('supabase/migrations/202608130032_make_phase_two_allocator_team_safe.sql'),
    read('supabase/migrations/202608130003_harden_phase_two_release_invariants.sql'),
  ]);

  assert.match(allocator, /message='phase_two_coverage_invalid'/);
  assert.match(allocator, /message='phase_two_assignment_count_invalid'/);
  assert.match(stageMachine, /not phase_two_official_assignment_set_complete\(\)[\s\S]*message='phase_two_assignment_count_invalid'/);
  assert.ok(
    stageMachine.indexOf('not phase_two_official_assignment_set_complete()')
      < stageMachine.indexOf('update game_state set stage=p_stage'),
  );
});
