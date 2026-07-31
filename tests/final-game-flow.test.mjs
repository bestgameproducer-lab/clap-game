import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const phaseOne = await readFile(new URL('../supabase/migrations/202607310003_finalize_phase_one_assignments.sql', import.meta.url), 'utf8');
const phaseTwo = await readFile(new URL('../supabase/migrations/202607310004_phase_two_photo_exclusion.sql', import.meta.url), 'utf8');
const passwordMigration = await readFile(new URL('../supabase/migrations/202607310005_admin_password_rotation.sql', import.meta.url), 'utf8');
const fixedDrawMigration = await readFile(new URL('../supabase/migrations/202607310006_align_unfinished_fixed_draws.sql', import.meta.url), 'utf8');
const teamClueMigration = await readFile(new URL('../supabase/migrations/202607310007_phase_two_team_rank_clues.sql', import.meta.url), 'utf8');
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const loginRoute = await readFile(new URL('../app/api/admin-login/route.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

test('final phase-one catalogue has exact capacities and fixed named allocations', () => {
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

test('opening final voting awards ranked team clues atomically and idempotently', () => {
  assert.match(teamClueMigration, /dense_rank\(\) over\(order by score desc\)/);
  assert.match(teamClueMigration, /when v_team\.team_rank=1 then 2 when v_team\.team_rank=2 then 1/);
  assert.match(teamClueMigration, /g\.id<>v_spy_id/);
  assert.match(teamClueMigration, /on conflict\(guest_id,clue_id\) do nothing/);
  assert.match(teamClueMigration, /perform settle_phase_two_team_clues\(p_actor\)/);
  assert.match(teamClueMigration, /phase_two\.team_clues_settle/);
  assert.match(adminData, /phase_two_team_scores_missing/);
  assert.match(adminData, /phase_two_team_clues_missing/);
  assert.doesNotMatch(teamClueMigration, /truncate|delete from/);
});
