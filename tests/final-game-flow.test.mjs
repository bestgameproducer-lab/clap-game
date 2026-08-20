import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const phaseOne = await readFile(new URL('../supabase/migrations/202607310003_finalize_phase_one_assignments.sql', import.meta.url), 'utf8');
const phaseTwo = await readFile(new URL('../supabase/migrations/202607310004_phase_two_photo_exclusion.sql', import.meta.url), 'utf8');
const passwordMigration = await readFile(new URL('../supabase/migrations/202607310005_admin_password_rotation.sql', import.meta.url), 'utf8');
const fixedDrawMigration = await readFile(new URL('../supabase/migrations/202607310006_align_unfinished_fixed_draws.sql', import.meta.url), 'utf8');
const teamClueMigration = await readFile(new URL('../supabase/migrations/202607310007_phase_two_team_rank_clues.sql', import.meta.url), 'utf8');
const liveDrawMigration = await readFile(new URL('../supabase/migrations/202607310008_fix_live_random_card_draw.sql', import.meta.url), 'utf8');
const teamCoverageMigration = await readFile(new URL('../supabase/migrations/202607310011_fix_phase_one_team_coverage.sql', import.meta.url), 'utf8');
const phaseTwoResetMigration = await readFile(new URL('../supabase/migrations/202607310012_reset_phase_two_runtime.sql', import.meta.url), 'utf8');
const randomRoleResetMigration = await readFile(new URL('../supabase/migrations/202607310013_reset_random_story_roles.sql', import.meta.url), 'utf8');
const phaseTwoTransitionMigration = await readFile(new URL('../supabase/migrations/202607310014_finalize_before_phase_two.sql', import.meta.url), 'utf8');
const speechReservationMigration = await readFile(new URL('../supabase/migrations/202607310015_reserve_phase_two_speech_player.sql', import.meta.url), 'utf8');
const speechPresetMigration = await readFile(new URL('../supabase/migrations/202607310016_align_fixed_speech_preset.sql', import.meta.url), 'utf8');
const teamClueUuidMigration = await readFile(new URL('../supabase/migrations/202607310017_fix_team_clue_spy_uuid.sql', import.meta.url), 'utf8');
const passwordPathFix = await readFile(new URL('../supabase/migrations/202607310010_fix_admin_password_pgcrypto_path.sql', import.meta.url), 'utf8');
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const loginRoute = await readFile(new URL('../app/api/admin-login/route.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

test('historical phase-one catalogue keeps its original capacities and named allocations auditable', () => {
  for (const row of [
    "('P1-CER-001',5,1)", "('P1-CER-002',3,2)", "('P1-CER-003',3,1)", "('P1-CER-004',3,1)",
    "('P1-HEART-001',2,5)", "('P1-STAR-001',2,5)", "('P1-SOCIAL-001',2,2)",
    "('P1-SOCIAL-002',2,2)", "('P1-BONUS-001',2,2)", "('P1-TRICKSTER-001',0,null::integer)",
  ]) assert.ok(phaseOne.includes(row), `missing ${row}`);
  assert.match(phaseOne, /lower\(login_name\)='siran li'/);
  assert.match(phaseOne, /lower\(login_name\)='moshuang xu'/);
  assert.match(phaseOne, /lower\(v_guest\.login_name\) in\('feifei xie','luyi sun'\)/);
  assert.match(phaseOne, /story_role='APPLAUSE_STARTER'/);
  assert.doesNotMatch(phaseOne, /truncate|delete from guests|delete from assignments/);
});

test('tricksters are random one-per-team and use only approved photo facades', () => {
  const draw = phaseOne.slice(phaseOne.indexOf('create or replace function draw_guest_card'));
  assert.match(phaseOne, /role='guest',role_locked=false,eligible_for_secret_role=true/);
  assert.match(draw, /greatest\(0,1-v_drawn_spies\)/);
  assert.match(draw, /mission_code in\('P1-SOCIAL-001','P1-SOCIAL-002'\)/);
  assert.match(draw, /assigned_guest\.role='guest'/);
  assert.match(draw, /mission_code='P1-TRICKSTER-001'/);
});

test('phase-two allocator rejects repeat photo recipients transactionally', () => {
  assert.match(phaseTwo, /P1-SOCIAL-001','P1-SOCIAL-002/);
  assert.match(phaseTwo, /phase_two_repeat_photo_assignment/);
  assert.match(phaseTwo, /primary_mission in\('TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE'\)/);
  assert.match(phaseTwo, /pg_advisory_xact_lock/);
  assert.doesNotMatch(phaseTwo, /truncate|delete from assignments|delete from guests/);
});

test('administrator password rotation is bcrypt-only, audited, and revokes sessions', () => {
  assert.match(passwordMigration, /crypt\(p_password,gen_salt\('bf',12\)\)/);
  assert.match(passwordMigration, /update admin_sessions set revoked_at=coalesce\(revoked_at,now\(\)\)/);
  assert.match(passwordMigration, /admin_password\.rotate/);
  assert.doesNotMatch(passwordMigration, /jsonb_build_object\([^)]*p_password/);
  assert.match(loginRoute, /verifyAdminPasswordOverride/);
  assert.match(adminRoute, /type === 'rotateAdminPassword'/);
  assert.match(adminPage, /更换管理员密码并退出所有设备/);
  assert.match(passwordPathFix, /verify_admin_password_override[\s\S]+search_path=public,extensions/);
  assert.match(passwordPathFix, /rotate_admin_password[\s\S]+search_path=public,extensions/);
  assert.match(passwordPathFix, /existing_hashes_preserved',true/);
  assert.doesNotMatch(passwordPathFix, /delete from admin_credential_override|truncate|drop table/);
});

test('unfinished fixed draws align forward-only without rewriting score history', () => {
  assert.match(fixedDrawMigration, /v_assignment\.status<>'assigned'/);
  assert.match(fixedDrawMigration, /v_assignment\.evidence_path is not null/);
  assert.match(fixedDrawMigration, /v_assignment\.submitted_at is not null/);
  assert.match(fixedDrawMigration, /exists\(select 1 from points_ledger where assignment_id=v_assignment\.id\)/);
  assert.match(fixedDrawMigration, /fixed_draw_runtime_conflict/);
  assert.match(fixedDrawMigration, /complete_system_mission\(v_guest_id,'INSTANT_BONUS'/);
  assert.doesNotMatch(fixedDrawMigration, /delete from|truncate|update points_ledger/);
});

test('ranked team clues remain atomic and idempotent before the explicit settlement upgrade', () => {
  assert.match(teamClueMigration, /dense_rank\(\) over\(order by score desc\)/);
  assert.match(teamClueMigration, /when v_team\.team_rank=1 then 2 when v_team\.team_rank=2 then 1/);
  assert.match(teamClueMigration, /g\.id<>v_spy_id/);
  assert.match(teamClueMigration, /on conflict\(guest_id,clue_id\) do nothing/);
  assert.match(teamClueMigration, /phase_two\.team_clues_settle/);
  assert.match(adminData, /phase_two_team_scores_missing/);
  assert.match(adminData, /phase_two_team_clues_missing/);
  assert.doesNotMatch(teamClueMigration, /truncate|delete from/);
});

test('final voting now requires an explicit team settlement and team-scoped clues', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607310032_explicit_team_clue_settlement.sql', import.meta.url), 'utf8');
  assert.match(migration, /team_clues_settled_at/);
  assert.match(migration, /message='team_clues_not_settled'/);
  assert.match(migration, /c\.team_scope=v_team\.team/);
  assert.match(migration, /when v_team\.team_rank=1 then 2 when v_team\.team_rank=2 then 1/);
  assert.doesNotMatch(migration.slice(migration.indexOf('create or replace function set_game_flag')), /perform settle_phase_two_team_clues\(p_actor\)/);
});

test('live draw safely creates tricksters and fills random heart/star/photo slots', () => {
  assert.match(liveDrawMigration, /on conflict on constraint assignments_guest_id_task_id_key do nothing/);
  assert.doesNotMatch(liveDrawMigration, /on conflict\(guest_id,task_id\) do nothing/);
  assert.match(liveDrawMigration, /t\.mission_code='P1-HEART-001'/);
  assert.match(liveDrawMigration, /t\.mission_code='P1-STAR-001'/);
  assert.match(liveDrawMigration, /reserved\.story_role='HEART_HOLDER'/);
  assert.match(liveDrawMigration, /reserved\.story_role='STAR_HOLDER'/);
  assert.match(liveDrawMigration, /when 'P1-HEART-001' then 'HEART_HOLDER'/);
  assert.match(liveDrawMigration, /when 'P1-STAR-001' then 'STAR_HOLDER'/);
  assert.match(liveDrawMigration, /assigned_guest\.role='guest'/);
  assert.doesNotMatch(liveDrawMigration, /delete from|truncate/);
});

test('live draw reserves all relationship roles for the competitive roster', () => {
  assert.match(teamCoverageMigration, /v_guest\.phase_two_eligible and t\.mission_code='P1-HEART-001'/);
  assert.match(teamCoverageMigration, /v_guest\.phase_two_eligible and t\.mission_code='P1-STAR-001'/);
  assert.match(teamCoverageMigration, /assigned_guest\.phase_two_eligible\)[\s\S]+reserved\.phase_two_eligible[\s\S]+<5\)/);
  assert.match(teamCoverageMigration, /case when t\.mission_code='P1-SOCIAL-001' then 2 else 1 end/);
  assert.match(teamCoverageMigration, /not v_guest\.phase_two_eligible and v_guest\.team='家人组'/);
  assert.match(teamCoverageMigration, /case when t\.mission_code='P1-SOCIAL-002' then 1 else 0 end/);
  assert.match(teamCoverageMigration, /'competitive_hearts',5,'competitive_stars',5/);
  assert.doesNotMatch(teamCoverageMigration, /delete from|truncate/);
});

test('rehearsal reset also clears all phase-two runtime state', () => {
  assert.match(phaseTwoResetMigration, /after insert on rehearsal_resets/);
  assert.match(phaseTwoResetMigration, /delete from phase_two_dilemmas where true/);
  assert.match(phaseTwoResetMigration, /delete from phase_two_copy_choices where true/);
  assert.match(phaseTwoResetMigration, /delete from phase_two_profiles where true/);
  assert.match(phaseTwoResetMigration, /configuration_preserved',true/);
  assert.doesNotMatch(phaseTwoResetMigration, /delete from guests|delete from tasks|truncate/);
});

test('rehearsal reset clears random story roles but preserves locked presets', () => {
  assert.match(randomRoleResetMigration, /update guests set story_role='NONE',ceremony_eligible=false/);
  assert.match(randomRoleResetMigration, /where not role_locked and story_role<>'NONE'/);
  assert.match(randomRoleResetMigration, /locked_presets_preserved',true/);
  assert.doesNotMatch(randomRoleResetMigration, /delete from guests|truncate/);
});

test('act-two transition finalizes relationship roles before allocation', () => {
  const finalizeAt = phaseTwoTransitionMigration.indexOf('perform finalize_phase_one_content(p_actor)');
  const unlockAt = phaseTwoTransitionMigration.indexOf('unlock_phase_two_missions(p_actor)');
  assert.ok(finalizeAt > 0 && unlockAt > finalizeAt);
  assert.match(phaseTwoTransitionMigration, /p_stage='task_round_2'/);
  assert.match(phaseTwoTransitionMigration, /atomic_transition',true/);
  assert.doesNotMatch(phaseTwoTransitionMigration, /delete from|truncate/);
});

test('fixed act-two speech player cannot consume a relationship or trickster slot', () => {
  assert.match(speechReservationMigration, /lower\(v_guest\.login_name\)='yirui zhang' or v_guest\.story_role/);
  assert.match(speechReservationMigration, /mission_code='P1-SOCIAL-001'/);
  assert.match(speechReservationMigration, /speech_player\.drawn_at is null/);
  assert.match(speechReservationMigration, /relationship_role_excluded',true,'trickster_excluded',true/);
  assert.match(speechReservationMigration, /speech_player_reservation_incomplete/);
  assert.doesNotMatch(speechReservationMigration, /delete from|truncate/);
});

test('unfinished fixed speech player cannot retain a conflicting symbol preset', () => {
  assert.match(speechPresetMigration, /drawn_at is null and lower\(login_name\)='yirui zhang'/);
  assert.match(speechPresetMigration, /story_role in\('HEART_HOLDER','STAR_HOLDER'\)/);
  assert.match(speechPresetMigration, /story_role='NONE'/);
  assert.match(speechPresetMigration, /conflicting_symbol_preset_removed',true/);
  assert.doesNotMatch(speechPresetMigration, /delete from|truncate|update assignments|update points_ledger/);
});

test('team clue settlement selects a UUID without unsupported min aggregation', () => {
  assert.match(teamClueUuidMigration, /array_agg\(id order by id\)\)\[1\]/);
  assert.match(teamClueUuidMigration, /count\(\*\)::integer into v_spy_id,v_spy_count/);
  assert.match(teamClueUuidMigration, /team_clue_spy_uuid_patch_failed/);
  assert.doesNotMatch(teamClueUuidMigration, /delete from|truncate/);
});
