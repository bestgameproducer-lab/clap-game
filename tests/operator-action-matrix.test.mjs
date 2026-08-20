import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every operator console action is backed by an authenticated same-origin route branch', async () => {
  const [adminPage, hostPage, stationPage, adminRoute, hostRoute, evidenceRoute] = await Promise.all([
    read('app/admin/page.tsx'),
    read('app/host/page.tsx'),
    read('app/station/page.tsx'),
    read('app/api/admin-action/route.ts'),
    read('app/api/host-action/route.ts'),
    read('app/api/station-evidence/route.ts'),
  ]);

  const adminActions = [
    'toggleVoting', 'settleTeamClues', 'toggleResults', 'toggleScoreboard',
    'toggleRegistration', 'rotateInvitationCode', 'rotateAdminPassword',
    'setStage', 'setGuestPhaseNote', 'resetGuestClaim', 'approve',
    'completeAtStation', 'reject', 'adjustPoints', 'adjustTeamPoints',
    'setLiveDisplay', 'assignTask', 'reassignTask', 'updateCeremonyAssignment',
    'resetRehearsal', 'retryRehearsalCleanup', 'grantClue', 'deactivateClue',
    'configureGuest', 'configureStoryRole', 'configurePhaseTwoProfile',
    'undoRelationship', 'saveGuestRoster', 'importGuestRoster', 'saveTask',
    'saveClue', 'saveAward',
  ];
  for (const action of adminActions) {
    assert.match(adminRoute, new RegExp(`type === '${action}'`), `${action} needs a server branch`);
  }
  for (const action of ['adjustTeamPoints', 'adjustGuestPoints', 'toggleVoting', 'settleTeamClues', 'publishResults', 'setStage']) {
    assert.match(hostPage, new RegExp(`type: '${action}'`), `${action} needs a host control`);
    assert.match(hostRoute, new RegExp(`type === '${action}'`), `${action} needs a host route branch`);
  }
  for (const action of ['adjustPoints', 'assignTask', 'completeAtStation', 'grantClue', 'reject']) {
    assert.match(stationPage, new RegExp(`type: '${action}'`), `${action} needs a station control`);
    assert.match(adminRoute, new RegExp(`type === '${action}'`), `${action} needs a shared staff route branch`);
  }
  for (const route of [adminRoute, hostRoute, evidenceRoute]) {
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /requireAdmin\(\)/);
  }
  assert.match(adminPage, /fetch\('\/api\/admin-action'/);
  assert.match(hostPage, /fetch\('\/api\/host-action'/);
  assert.match(stationPage, /fetch\('\/api\/admin-action'/);
});

test('all three staff consoles expose one coherent personal-score contract', async () => {
  const [adminPage, hostPage, stationPage, adminRoute, hostRoute, adminData, hostData] = await Promise.all([
    read('app/admin/page.tsx'),
    read('app/host/page.tsx'),
    read('app/station/page.tsx'),
    read('app/api/admin-action/route.ts'),
    read('app/api/host-action/route.ts'),
    read('lib/data/admin.ts'),
    read('lib/data/host.ts'),
  ]);

  for (const page of [adminPage, stationPage]) {
    assert.match(page, /type: 'adjustPoints'/);
    assert.match(page, /createEventKey\(\)/);
    assert.match(page, /rehearsalRunId: data\.game\?\.rehearsal_run_id/);
    assert.match(page, /Number\(pointAmount\) === 0/);
    assert.match(page, /家人组也可以获得个人/);
    assert.match(page, /不(?:会)?改变团队/);
    assert.match(page, /终局.*锁定/);
  }
  assert.match(hostPage, /type: 'adjustGuestPoints'/);
  assert.match(hostPage, /createEventKey\(\)/);
  assert.match(hostPage, /rehearsalRunId: data\?\.game\?\.rehearsal_run_id/);
  assert.match(hostPage, /这里只增加个人积分，不改变团队挑战分/);
  assert.match(hostPage, /家人组也可以获得个人积分/);
  assert.match(hostPage, /终局结算已经产生，本场个人积分已永久锁定/);

  assert.match(adminRoute, /requiredInteger\(body\.amount, '积分调整', -1000, 1000\)/);
  assert.match(hostRoute, /requiredInteger\(body\.amount, '个人加分', 1, 100\)/);
  assert.match(adminRoute, /requiredString\(body\.reason, '调整原因', 200\)/);
  assert.match(hostRoute, /requiredString\(body\.reason, '加分原因', 200\)/);
  assert.match(adminRoute, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.match(hostRoute, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.match(adminData, /rpc\('adjust_staff_guest_points_for_run'/);
  assert.match(hostData, /rpc\('adjust_host_guest_points_for_run'/);
});

test('personal scoring is database-authoritative, audited, run-scoped and team-isolated', async () => {
  const [scoreMigration, runMigration, finalMigration, scoreboard] = await Promise.all([
    read('supabase/migrations/202608130010_harden_staff_scoring_and_clue_grants.sql'),
    read('supabase/migrations/202608130016_scope_manual_score_requests_to_rehearsal.sql'),
    read('supabase/migrations/202608130011_lock_final_results_and_retire_hidden_spy.sql'),
    read('lib/scoreboard-core.ts'),
  ]);
  for (const name of ['adjust_staff_guest_points', 'adjust_host_guest_points']) {
    const start = scoreMigration.indexOf(`create or replace function ${name}`);
    assert.ok(start >= 0, `${name} must exist`);
    const next = scoreMigration.indexOf('create or replace function ', start + 30);
    const body = scoreMigration.slice(start, next < 0 ? undefined : next);
    assert.match(body, /from points_ledger where event_key=p_event_key/);
    assert.match(body, /insert into points_ledger/);
    assert.match(body, /insert into audit_log/);
    assert.match(body, /final_results_locked/);
    assert.match(body, /eligible_for_personal_score/);
    assert.doesNotMatch(body, /insert into team_points_ledger|update team_points_ledger/);
  }
  assert.equal((runMigration.match(/perform assert_current_rehearsal_run\(p_rehearsal_run_id\)/g) ?? []).length, 4);
  assert.match(runMigration, /message='rehearsal_run_mismatch'/);
  assert.match(finalMigration, /message='final_results_locked'/);
  assert.match(scoreboard, /NON_TEAM_SCORE_GROUPS = new Set\(\['家人组'\]\)/);
  assert.match(scoreboard, /if \(NON_TEAM_SCORE_GROUPS\.has\(entry\.team\)\) continue/);
});

test('stage-sensitive buttons mirror the same server guards and surface actionable errors', async () => {
  const [adminPage, hostPage, stationPage, stages, adminData, hostData, guardMigration] = await Promise.all([
    read('app/admin/page.tsx'),
    read('app/host/page.tsx'),
    read('app/station/page.tsx'),
    read('lib/game-stages.ts'),
    read('lib/data/admin.ts'),
    read('lib/data/host.ts'),
    read('supabase/migrations/202608130027_close_operator_consistency_gaps.sql'),
  ]);
  assert.match(stages, /export function isNextLiveGameStage/);
  assert.match(adminPage, /!isNextLiveGameStage\(data\.game\?\.stage, stage\)/);
  assert.match(hostPage, /!isNextLiveGameStage\(data\.game\?\.stage, stage\)/);
  assert.match(adminData, /invalid_game_stage_transition/);
  assert.match(hostData, /invalid_game_stage_transition/);
  assert.match(stationPage, /isTaskActionOpenAtStage\(assignment\.task\?\.stage, data\.game\?\.stage\)/);
  assert.match(guardMigration, /message='assignment_stage_closed'/);
  assert.match(adminData, /当前婚礼环节不允许核验这项任务/);
  assert.match(adminPage, /切换失败：\{stageError\}/);
  assert.match(hostPage, /throw new Error\(result\.error \|\| '婚礼流程切换失败'\)/);
  assert.match(stationPage, /当前环节暂停核验，流程开放后再处理/);
});

test('opening registration points the operator to the exact failed preflight screen', async () => {
  const adminData = await read('lib/data/admin.ts');
  assert.match(adminData, /formal_wedding_preflight_not_ready/);
  assert.match(adminData, /回到“开场与宾客”查看红色待处理项/);
  assert.match(adminData, /21 项正式任务/);
});
