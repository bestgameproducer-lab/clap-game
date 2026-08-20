import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../supabase/migrations/202608130002_harden_official_task_boundaries.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');

test('phase-two idempotency accepts only the complete official 20-player assignment set', () => {
  assert.match(migration, /create or replace function phase_two_official_assignment_set_complete\(\)/);
  assert.match(migration, /select count\(\*\) from phase_two_profiles\)<>20/);
  assert.match(migration, /where a\.status<>'cancelled' and t\.mission_code like 'P2-%'[\s\S]*?\)<>20/);
  assert.match(migration, /primary_mission='HEART_DILEMMA'\)<>4/);
  assert.match(migration, /primary_mission='STAR_DILEMMA'\)<>4/);
  assert.match(migration, /primary_mission='TRICKSTER'\)<>2/);
  assert.match(migration, /primary_mission='EXTRA_VOTE'\)<>2/);
  assert.match(migration, /message='phase_two_existing_assignments_incomplete'/);
  assert.match(migration, /v_count:=unlock_phase_two_missions_assignments_v1\(p_actor\)/);
  assert.match(migration, /v_count<>20 or not phase_two_official_assignment_set_complete\(\)/);
  assert.equal((migration.match(/perform settle_phase_two_lucky\(p_actor\)/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /if v_count>0 then return v_count/);
});

test('lonely Cupid copy excludes the lucky multiplier by formal mission code', () => {
  const settlement = migration.slice(
    migration.indexOf('create or replace function settle_phase_two_copy_and_captain'),
    migration.indexOf('-- Shared validator'),
  );
  assert.match(settlement, /join assignments source_assignment on source_assignment\.id=l\.assignment_id/);
  assert.match(settlement, /join tasks source_task on source_task\.id=source_assignment\.task_id/);
  assert.match(settlement, /source_task\.mission_code not in\([\s\S]*'P2-LUCKY-001'/);
  assert.doesNotMatch(settlement, /丘比特幸运星 · 第一阶段积分翻倍/);
  assert.doesNotMatch(settlement, /超级幸运星 · 第一阶段积分翻倍/);
});

test('generic manual assignment validates guest, stage, role, capacity, and formal task boundary', () => {
  const validation = migration.slice(
    migration.indexOf('create or replace function validate_manual_task_assignment'),
    migration.indexOf('create or replace function assign_task_to_guest'),
  );
  assert.match(validation, /v_guest\.participation_mode<>'ACTIVE_PLAYER'/);
  assert.match(validation, /v_guest\.drawn_at is null/);
  assert.match(validation, /v_task\.mission_code ~\* '\^P\[12\]-'/);
  assert.match(validation, /v_task\.role_scope not in\('all',v_guest\.role\)/);
  assert.match(validation, /phase_one_interactions_open\(v_stage\)/);
  assert.match(validation, /v_stage not in\('task_round_2','banquet','group_game'\)/);
  assert.match(validation, /v_task\.max_assignments is not null/);
  assert.match(validation, /message='manual_task_capacity_full'/);
  assert.doesNotMatch(validation, /custom_task_formal_assignment_forbidden/);
  assert.doesNotMatch(validation, /v_task\.formal_allowed/);

  const assignment = migration.slice(
    migration.indexOf('create or replace function assign_task_to_guest'),
    migration.indexOf('create or replace function reassign_task_assignment'),
  );
  assert.match(assignment, /perform validate_manual_task_assignment\(p_guest_id,p_task_id,null\)/);

  const reassignment = migration.slice(
    migration.indexOf('create or replace function reassign_task_assignment'),
    migration.indexOf('create or replace function issue_hidden_task_code'),
  );
  assert.match(reassignment, /v_old_mission_code ~\* '\^P\[12\]-'/);
  assert.match(reassignment, /perform validate_manual_task_assignment\(v_old\.guest_id,p_task_id,v_old\.id\)/);
});

test('physical-card issuance is permanently retired at the database boundary', () => {
  const issue = migration.slice(
    migration.indexOf('create or replace function issue_hidden_task_code'),
    migration.indexOf('-- Fully retire'),
  );
  assert.match(issue, /message='hidden_task_codes_retired'/);
  assert.match(issue, /revoke all on function issue_hidden_task_code\(uuid,text,text\) from public,anon,authenticated,service_role/);
  assert.doesNotMatch(issue, /insert into hidden_task_codes|select id into v_task_id/);
});

test('retired applause role is removed from runtime controls without rewriting completed history', async () => {
  const [rules, admin, guest] = await Promise.all([
    readFile(new URL('../lib/game-rules.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(rules, /APPLAUSE_STARTER/);
  assert.doesNotMatch(admin, /APPLAUSE_STARTER/);
  assert.doesNotMatch(guest, /APPLAUSE_STARTER/);
  assert.match(migration, /a\.status in\('assigned','submitted','rejected'\)/);
  assert.match(migration, /approved_history_preserved',true/);
  assert.match(migration, /update tasks set active=false where mission_code='P1-CER-005'/);
});

test('operator UI keeps official tasks read-only and confines custom tasks to demo mode', async () => {
  const [page, route, data, retirement] = await Promise.all([
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608130011_lock_final_results_and_retire_hidden_spy.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /getManualTaskAvailability/);
  assert.match(page, /activeCatalogTasks = manualTaskAvailability\.tasks/);
  assert.match(page, /reassignableAssignments = data\.assignments\.filter[\s\S]*?!\/\^P\[12\]-\//);
  assert.match(page, /正式 P1\/P2 任务由版本化任务清单维护，这里仅供核对，不能在婚礼现场修改或停用/);
  assert.match(page, /正式模式已锁定任务清单/);
  assert.match(page, /新建演示任务/);
  assert.doesNotMatch(page, /activeHiddenTasks|隐藏任务实体卡|issueHiddenTaskCode/);
  assert.doesNotMatch(route, /saveAllianceClue/);
  assert.doesNotMatch(data, /saveAllianceClue|rpc\('save_alliance_clue_fragment'/);
  assert.match(data, /p_grants_hidden_spy: false/);
  assert.match(retirement, /official_task_catalog_locked/);
  assert.match(retirement, /before insert or update or delete on tasks/);
});

test('every active automated assignment path resolves to the exact 21-task official manifest', async () => {
  const [manifest, currentRules, familyRetirement, admin, station] = await Promise.all([
    readFile(new URL('../lib/official-task-manifest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608200002_bouquet_lucky_and_double_verdict.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608190001_retire_joint_family_guests.sql', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8'),
  ]);
  const expected = [
    'P1-CER-001', 'P1-CER-002', 'P1-BOUQUET-001',
    'P1-HEART-001', 'P1-STAR-001', 'P1-SOCIAL-001', 'P1-SOCIAL-002',
    'P1-BONUS-001', 'P1-TRICKSTER-001',
    'P2-SOCIAL-001', 'P2-SOCIAL-002', 'P2-SOCIAL-003', 'P2-SOCIAL-004',
    'P2-CEREMONY-001', 'P2-HEART-001', 'P2-STAR-001', 'P2-LONELY-001',
    'P2-GUIDE-001', 'P2-TRICKSTER-001', 'P2-POWER-001', 'P2-LUCKY-001',
  ];
  const declared = [...manifest.matchAll(/^\s*\['(P[12]-[A-Z0-9-]+)'/gm)].map((match) => match[1]);
  assert.deepEqual(declared.sort(), expected.slice().sort());
  assert.equal(new Set(declared).size, 21);

  const currentGuard = currentRules.slice(
    currentRules.indexOf('create or replace function is_official_wedding_mission_code'),
    currentRules.indexOf('revoke all on function is_official_wedding_mission_code'),
  );
  const guarded = [...currentGuard.matchAll(/'(P[12]-[A-Z0-9-]+)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(guarded)].sort(), expected.slice().sort());
  assert.match(currentRules, /mission_code='P1-BOUQUET-001'[\s\S]*assigned_guest\.phase_two_eligible\)<2/);
  assert.match(currentRules, /p\.primary_mission='SUPER_LUCKY'[\s\S]*lower\(g\.login_name\) in\('feifei xie','luyi sun'\)/);
  assert.match(familyRetirement, /mission_code='P1-FAMILY-001'/);
  assert.match(familyRetirement, /set active=false,formal_allowed=false/);
  for (const code of expected.filter((value) => value.startsWith('P2-'))) assert.ok(currentRules.includes(code));
  assert.match(currentRules, /insert into assignments\(guest_id,task_id\)[\s\S]*?join tasks t on t\.mission_code=case p\.primary_mission/);

  assert.match(admin, /演示任务不会进入正式任务清单/);
  assert.match(admin, /!\/\^P\[12\]-\/i/);
  assert.match(station, /此入口只在演示任务池中开放/);
  assert.match(station, /manualTaskUnavailableReason/);
});

test('first-act social capacity includes exactly two balanced trickster facades', async () => {
  const [manifest, migration] = await Promise.all([
    readFile(new URL('../lib/official-task-manifest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608130017_balance_trickster_facade_capacity.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(manifest, /\['P1-SOCIAL-001', 2, 3,/);
  assert.match(manifest, /\['P1-SOCIAL-002', 2, 3,/);
  assert.match(migration, /draw_guest_card_before_final_lock\(uuid\)/);
  assert.match(migration, /v_guest\.team='海岛组' then 'P1-SOCIAL-001' else 'P1-SOCIAL-002'/);
  assert.match(migration, /formal_wedding_catalog_ready/);
  assert.match(migration, /formal_catalog_facade_capacity_patch_failed/);
  assert.match(migration, /update tasks set max_assignments=3/);
  assert.match(migration, /'normal_social_assignments',4/);
  assert.match(migration, /'trickster_facade_overlays',2/);
});

test('live admin task detail and review queue cannot revive retired assignments', () => {
  assert.match(adminData, /task:tasks!assignments_task_id_fkey\(id,title,verification_method,points,mission_code\)/);
  assert.match(adminData, /const rawAssignments = results\[1\]\.data \?\? \[\]/);
  assert.match(adminData, /const catalogAssignments = rawAssignments\.filter\(\(assignment\) => \(\s*isTaskAllowedInCatalogMode\(assignment\.task, game\?\.task_catalog_mode\)/);
  assert.match(adminData, /const catalogSubmissions = \(results\[3\]\.data \?\? \[\]\)\.filter\(\(assignment\) => \(\s*isTaskAllowedInCatalogMode\(assignment\.task, game\?\.task_catalog_mode\)/);
  assert.match(adminData, /assignments: await signEvidencePaths\(catalogAssignments\)/);
  assert.match(adminData, /submissions: await signEvidencePaths\(catalogSubmissions\)/);
  assert.match(adminData, /const retiredApprovedAssignments = rawAssignments\.filter/);
});
