import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202608130010_harden_staff_scoring_and_clue_grants.sql', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const hostRoute = await readFile(new URL('../app/api/host-action/route.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const hostPage = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');
const stationPage = await readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8');
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const stationData = await readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8');
const hostData = await readFile(new URL('../lib/data/host.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');
const stageBoundaryMigration = await readFile(new URL('../supabase/migrations/202608130015_lock_team_scoring_and_fix_trickster_window.sql', import.meta.url), 'utf8');
const runScopeMigration = await readFile(new URL('../supabase/migrations/202608130016_scope_manual_score_requests_to_rehearsal.sql', import.meta.url), 'utf8');
const liveManualContentMigration = await readFile(new URL('../supabase/migrations/202608130019_lock_manual_content_to_live_run.sql', import.meta.url), 'utf8');
const settledClueData = await readFile(new URL('../lib/data/settled-team-clues.ts', import.meta.url), 'utf8');

test('staff personal score corrections are retry-safe and never silently change the requested amount', () => {
  assert.match(migration, /adjust_staff_guest_points/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('staff-score:'\|\|p_event_key::text\)\)/);
  assert.match(migration, /v_existing\.guest_id<>p_guest_id[\s\S]*v_existing\.amount<>p_amount[\s\S]*v_existing\.reason<>trim\(p_reason\)/);
  assert.match(migration, /not v_guest\.active or not v_guest\.uses_app or not v_guest\.eligible_for_personal_score/);
  assert.match(migration, /insert into points_ledger\(guest_id,amount,reason,event_key,actor\)/);
  assert.match(migration, /values\(p_guest_id,p_amount,trim\(p_reason\),p_event_key,p_actor\)/);
  assert.match(migration, /p_amount is null or p_amount=0/);
});

test('team clue settlement uses one exact eligibility and selectable-clue boundary', () => {
  const settlement = migration.slice(
    migration.indexOf('create or replace function settle_phase_two_team_clues'),
    migration.indexOf('revoke all on function adjust_staff_guest_points'),
  );
  assert.match(settlement, /active and uses_app[\s\S]*participation_mode='ACTIVE_PLAYER'[\s\S]*phase_two_eligible[\s\S]*drawn_at is not null/);
  assert.match(settlement, /c\.spy_guest_id=v_spy_id or c\.spy_guest_id is null/);
  assert.match(settlement, /g\.active and g\.uses_app and g\.participation_mode='ACTIVE_PLAYER'/);
  assert.match(settlement, /v_spy_count<>1/);
  assert.match(hostPage, /guest\.participation_mode === 'ACTIVE_PLAYER'[\s\S]*guest\.phase_two_eligible/);
  assert.match(adminPage, /guest\.uses_app[\s\S]*guest\.participation_mode === 'ACTIVE_PLAYER'[\s\S]*guest\.phase_two_eligible/);
  assert.match(adminPage, /clue\.spy_guest_id === null \|\| teamTricksters\.some/);
  assert.match(hostData, /select\('team_scope,active,spy_guest_id'\)/);
  assert.match(hostData, /const eligibleTeamTricksters = orderedGuests\.filter/);
  assert.match(hostData, /guest\.phase_two_eligible && guest\.drawn_at && guest\.role === 'spy' && !guest\.is_hidden_spy/);
  assert.match(hostData, /clue\.spy_guest_id === null \|\| teamTricksterIds\.includes\(clue\.spy_guest_id\)/);
});

test('staff team score corrections are isolated, retry-safe, and locked after settlement', () => {
  const teamScore = migration.slice(
    migration.indexOf('create or replace function adjust_staff_team_points'),
    migration.indexOf('-- Freeze the public final ranking'),
  );
  assert.match(teamScore, /adjust_staff_team_points/);
  assert.match(teamScore, /v_existing\.team<>p_team or v_existing\.amount<>p_amount or v_existing\.reason<>trim\(p_reason\)/);
  assert.match(teamScore, /team_clues_settled_at is not null/);
  assert.match(teamScore, /insert into team_points_ledger\(team,amount,reason,event_key,actor\)/);
  assert.doesNotMatch(teamScore, /update guests set points/);
  assert.match(stageBoundaryMigration, /adjust_staff_team_points_before_group_game_lock/);
  assert.match(stageBoundaryMigration, /adjust_host_team_points_before_group_game_lock/);
  assert.equal((stageBoundaryMigration.match(/v_stage is distinct from 'group_game'/g) ?? []).length, 2);
  assert.match(stageBoundaryMigration, /team_score_stage_closed/);
  assert.match(stageBoundaryMigration, /team_score_event_retry_total/);
  assert.match(stageBoundaryMigration, /v_existing\.team is distinct from p_team/);
  assert.match(stageBoundaryMigration, /v_existing\.amount is distinct from p_amount/);
  assert.match(stageBoundaryMigration, /v_existing\.reason is distinct from trim\(p_reason\)/);
  assert.equal((stageBoundaryMigration.match(/if v_retry_total is not null then return v_retry_total/g) ?? []).length, 2);
});

test('manual clue grants fail closed for inactive, ineligible, and cross-team guests', () => {
  assert.match(migration, /grant_guest_clue/);
  assert.match(migration, /not v_guest\.active or not v_guest\.uses_app or not v_guest\.phase_two_eligible[\s\S]*v_guest\.participation_mode<>'ACTIVE_PLAYER'[\s\S]*v_guest\.drawn_at is null/);
  assert.match(migration, /v_clue\.team_scope is distinct from v_guest\.team/);
  assert.match(migration, /clue_team_mismatch/);
  assert.match(migration, /revoke all on function grant_guest_clue\(uuid,uuid,text\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function grant_guest_clue\(uuid,uuid,text\) to service_role/);
  assert.match(stageBoundaryMigration, /public\.grant_guest_clue\(uuid,uuid,text\)/);
  assert.match(stageBoundaryMigration, /v_clue\.spy_guest_id is not null and \(/);
  assert.match(stageBoundaryMigration, /select count\(\*\) from guests spy[\s\S]*spy\.team=v_guest\.team\)<>1/);
  assert.match(stageBoundaryMigration, /or not exists\([\s\S]*spy\.id=v_clue\.spy_guest_id/);
  assert.match(stageBoundaryMigration, /message='clue_spy_mismatch'/);
  assert.match(liveManualContentMigration, /message='clue_not_earned_in_current_rehearsal'/);
  assert.match(adminPage, /selectableCluesForSelectedGuest/);
  assert.match(adminPage, /settledClueIdsForSelectedTeam\.has\(clue\.id\)/);
  assert.match(adminPage, /团队结算前不能补发线索/);
  assert.match(adminPage, /!data\.game\?\.team_clues_settled_at \|\| !selectedGuestClueEligible/);
});

test('station clue recovery can only repeat a clue already issued in this settlement', () => {
  assert.match(stageBoundaryMigration, /team_clue_audit_snapshot_patch_failed/);
  assert.match(stageBoundaryMigration, /'clue_ids',to_jsonb\(v_clue_ids\)/);
  assert.match(stationData, /db\.from\('audit_log'\)\.select\('action,details,created_at'\)/);
  assert.match(stationData, /\['rehearsal\.reset', 'phase_two\.team_clues_settle'\]/);
  assert.match(stationData, /settledClueIdsByTeam\(settlementAudit\.data \?\? \[\]\)/);
  assert.match(stationData, /const settledTeamClueKeys = new Set\(Object\.entries\(settledIdsByTeam\)/);
  assert.match(settledClueData, /entry\.created_at <= latestResetAt/);
  assert.match(settledClueData, /Array\.isArray\(details\?\.clue_ids\)/);
  assert.match(stationData, /game\.data\?\.team_clues_settled_at/);
  assert.match(stationData, /settledTeamClueKeys\.has\(`\$\{clue\.team_scope\}:\$\{clue\.id\}`\)/);
  assert.doesNotMatch(stationData, /from\('guest_clues'\)/);
  assert.match(stationPage, /只显示本轮系统已经选中并发给同队成员的线索/);
  assert.match(stationPage, /任务站不能现场改选其他线索/);
});

test('staff score routes require bounded values, explicit teams, and idempotency keys', () => {
  assert.match(adminRoute, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.match(adminRoute, /requiredEnum\(body\.team, '组别', \['海岛组', '沙漠组'\] as const\)/);
  assert.match(hostRoute, /requiredEnum\(body\.team, '组别', \['海岛组', '沙漠组'\] as const\)/);
  assert.match(hostRoute, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.equal((adminRoute.match(/requiredUuid\(body\.rehearsalRunId, '婚礼运行批次'\)/g) ?? []).length, 1);
  assert.equal((hostRoute.match(/requiredUuid\(body\.rehearsalRunId, '婚礼运行批次'\)/g) ?? []).length, 1);
  assert.match(adminData, /rpc\('adjust_staff_guest_points_for_run'/);
  assert.match(adminData, /rpc\('adjust_staff_team_points_for_run'/);
  assert.match(hostData, /rpc\('adjust_host_guest_points_for_run'/);
  assert.match(hostData, /rpc\('adjust_host_team_points_for_run'/);
  assert.match(runScopeMigration, /pg_advisory_xact_lock\(hashtext\('wedding-rehearsal-reset-v1'\)\)/);
  assert.match(runScopeMigration, /v_current is distinct from p_rehearsal_run_id/);
  assert.match(runScopeMigration, /message='rehearsal_run_mismatch'/);
  assert.equal((runScopeMigration.match(/perform assert_current_rehearsal_run\(p_rehearsal_run_id\)/g) ?? []).length, 4);
  assert.match(adminPage, /rehearsalRunId: data\.game\?\.rehearsal_run_id/);
  assert.match(hostPage, /rehearsalRunId: data\?\.game\?\.rehearsal_run_id/);
  assert.match(stationData, /select\('stage,team_clues_settled_at,results_visible,results_published_at,rehearsal_run_id,task_catalog_mode'\)/);
  assert.match(stationPage, /rehearsalRunId: data\.game\?\.rehearsal_run_id/);
});

test('task station never exposes cancelled assignments or formal missions as manual rewards', () => {
  assert.match(stationData, /neq\('status', 'cancelled'\)/);
  assert.match(stationData, /mission_code/);
  assert.match(stationData, /is_demo/);
  assert.match(stationData, /\.is\('mission_code', null\)/);
  assert.match(stationPage, /specialTasks\.some\(\(task\) => task\.id === taskId\)/);
  assert.match(stationData, /getManualTaskAvailability/);
  assert.match(stationPage, /manualTaskUnavailableReason/);
  assert.doesNotMatch(stationPage, /hiddenCode|redeemHiddenTaskCode|兑换隐藏任务卡/);
});

test('changing a staff target clears every target-bound draft', () => {
  assert.match(adminPage, /setSelectedGuestId\(event\.target\.value\)[\s\S]*setSelectedAssignmentId\(''\)/);
  assert.match(stationPage, /function selectGuest[\s\S]*setPointAmount\(''\)[\s\S]*setClueId\(''\)/);
  assert.match(stationPage, /function selectGuest[\s\S]*pendingScoreRef\.current = null/);
});

test('manual score and review controls describe the actual settlement behavior', () => {
  assert.match(adminPage, /系统已按任务规则结算/);
  assert.match(stationPage, /积分已按任务规则结算/);
  assert.match(adminPage, /只改变个人积分，不改变团队分/);
  assert.match(stationPage, /只改变个人积分，不会改变团队挑战分/);
  assert.match(hostPage, /这里只增加个人积分，不改变团队挑战分/);
  assert.match(hostPage, /家人组也可以获得个人积分/);
  assert.match(stationPage, /家人组也可以获得个人积分/);
  assert.match(adminPage, /宾客操作：个人加分、预设身份、临时任务与线索/);
  assert.match(adminPage, /data\.game\?\.stage !== 'group_game'/);
  assert.match(hostPage, /data\.game\?\.stage !== 'group_game'/);
});

test('settled host scoring controls are fully locked and risky actions are confirmed', () => {
  assert.match(hostPage, /fieldset className="score-lock-fieldset" disabled=\{Boolean\(data\.game\?\.stage !== 'group_game' \|\| data\.game\?\.team_clues_settled_at \|\| finalLocked\)\}/);
  assert.match(hostPage, /fieldset className="score-lock-fieldset" disabled=\{finalLocked\}/);
  assert.match(hostPage, /确认记录[\s\S]*团队分/);
  assert.match(hostPage, /本次分数变化（累加）/);
});

test('host and station fail closed in every database terminal state', () => {
  assert.match(hostData, /db\.from\('result_rewards'\)\.select\('id'\)\.limit\(1\)/);
  assert.match(hostData, /finalLocked: Boolean\(game\.data\?\.results_published_at \|\| finalRewards\.data\?\.length\)/);
  assert.match(stationData, /db\.from\('result_rewards'\)\.select\('id'\)\.limit\(1\)/);
  assert.match(stationData, /finalLocked: Boolean\(game\.data\?\.results_published_at \|\| finalRewards\.data\?\.length\)/);
  assert.match(hostPage, /const finalLocked = Boolean\(data\?\.finalLocked\)/);
  assert.match(stationPage, /const finalResultsLocked = Boolean\(data\?\.finalLocked\)/);
  assert.match(hostPage, /const hostGuidance = finalLocked/);
  assert.match(hostPage, /终局奖励已经生成/);
  assert.match(hostPage, /公开状态尚未同步，请联系主控核对终局状态/);
  assert.match(hostPage, /查看最近人工积分调整/);
  assert.doesNotMatch(hostPage, /查看最近个人加分/);
});

test('admin final ledger never silently truncates personal score history', () => {
  assert.match(adminData, /from\('points_ledger'\)\.select\('id,guest_id,amount,reason,actor,created_at,guest:guests\(id,name\)'\)\.order\('created_at', \{ ascending: false \}\)/);
  assert.doesNotMatch(adminData, /from\('points_ledger'\)[^\n]*\.limit\(/);
  assert.match(adminPage, /完整个人积分流水 · \{data\.pointLedger\.length\} 条/);
  assert.match(adminPage, /data\.pointLedger\.map\(\(entry\)/);
  assert.doesNotMatch(adminPage, /data\.pointLedger\.slice\(/);
  assert.match(adminPage, /'host\.guest_points_add': '主持人个人加分'/);
  assert.match(adminPage, /'host\.team_points_add': '主持人团队计分'/);
});

test('dismissible sticky notices use compact accessible controls', () => {
  assert.match(adminPage, /aria-label="关闭成功提示"/);
  assert.match(stationPage, /aria-label="关闭成功提示"/);
  assert.match(hostPage, /aria-label="关闭成功提示"/);
  assert.match(styles, /\.sticky-notice\s*\{[^}]*display:flex/);
  assert.match(styles, /\.sticky-notice\s*>\s*button\s*\{[^}]*width:auto/);
});
