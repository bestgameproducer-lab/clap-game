import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/host-action/route.ts', import.meta.url), 'utf8');
const data = await readFile(new URL('../lib/data/host.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202607300004_host_score_controls.sql', import.meta.url), 'utf8');

test('host UI exposes score controls and a bounded finale workflow', () => {
  assert.match(page, /团队计分/);
  assert.match(page, /个人加分/);
  assert.match(page, /流程控制/);
  assert.match(page, /婚礼流程快捷切换/);
  assert.match(page, /type: 'adjustTeamPoints'/);
  assert.match(page, /type: 'adjustGuestPoints'/);
  assert.match(page, /投票与终局结算/);
  assert.match(page, /type: 'toggleVoting'/);
  assert.match(page, /type: 'publishResults'/);
  assert.match(page, /pendingScoreRef\.current\?\.signature === signature/);
  assert.match(page, /createEventKey\(\)/);
  for (const hidden of ['流程题库','发布到大屏','资源竞拍钱包','正确答案','投票对象']) assert.doesNotMatch(page, new RegExp(hidden));
});

test('host score mutations are authenticated, same-origin, validated, and idempotent', () => {
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /const actor = await requireAdmin\(\)/);
  assert.match(route, /requiredInteger\(body\.amount, '团队计分', 0, 100\)/);
  assert.match(route, /requiredInteger\(body\.amount, '个人加分', 1, 100\)/);
  assert.match(route, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.match(route, /const currentRunId = \(\) => requiredUuid\(body\.rehearsalRunId, '婚礼运行批次'\)/);
  assert.match(route, /requiredBoolean\(body\.value, '投票状态'\)/);
  assert.match(route, /setHostFinaleFlag\('results_visible', true, actor, currentRunId\(\)\)/);
  assert.match(route, /requiredEnum\(body\.stage, '游戏阶段', MANUAL_GAME_STAGES\)/);
  assert.match(route, /setHostGameStage/);
  assert.doesNotMatch(route, /saveSegment|publishSegment|adjustResources/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('host-score:'\|\|p_event_key::text\)\)/);
  assert.match(migration, /score_event_conflict/);
  assert.match(migration, /event_key uuid/);
});

test('team and personal scores stay in separate audited ledgers', () => {
  assert.match(migration, /insert into team_points_ledger\(team,amount,reason,event_key,actor\)/);
  assert.match(migration, /insert into points_ledger\(guest_id,amount,reason,event_key,actor\)/);
  assert.match(migration, /host\.team_points_add/);
  assert.match(migration, /host\.guest_points_add/);
  assert.match(migration, /eligible_for_personal_score/);
});

test('host data is an explicit private operations DTO', () => {
  assert.match(data, /select\('id,name,team,role,is_hidden_spy,points,participation_mode,phase_two_eligible,special_card_title,eligible_for_personal_score,drawn_at,special_card_revealed_at'\)/);
  assert.match(data, /select\('id,team,amount,reason,created_at'\)/);
  assert.match(data, /select\('id,guest_id,amount,reason,created_at,guest:guests\(id,name\)'\)[\s\S]*?\.not\('event_key', 'is', null\)/);
  assert.match(data, /select\('stage,voting_open,voting_round,results_visible,results_published_at,team_clues_settled_at,team_score_snapshot,rehearsal_run_id,task_catalog_mode'\)/);
  assert.match(data, /select\('id,voting_round,voter_guest_id,target_guest_id,vote_weight/);
  assert.match(data, /db\.from\('result_rewards'\)\.select\('id'\)\.limit\(1\)/);
  assert.match(data, /finalLocked: Boolean\(game\.data\?\.results_published_at \|\| finalRewards\.data\?\.length\)/);
  const scoreDto = data.slice(data.indexOf('export async function getHostDashboardData'), data.indexOf('export async function adjustHostTeamPoints'));
  assert.match(scoreDto, /voteCounts: game\.data\?\.results_visible \? rankings\.voteCounts : \[\]/);
  assert.doesNotMatch(scoreDto, /correct_answer|host_notes|team_resources/);
});

test('host finale mutations reuse the server-authoritative idempotent settlement boundary', () => {
  assert.match(data, /setHostFinaleFlag\(field: 'voting_open' \| 'results_visible'/);
  assert.match(data, /rpc\('set_game_flag_for_run'/);
  assert.match(page, /确认主持人终局操作/);
  assert.match(page, /结算具有幂等保护/);
  assert.match(page, /data\.game\?\.stage !== 'group_game'/);
  assert.doesNotMatch(page, /team_game/);
});

test('host flow controls use only manual wedding stages and require confirmation', () => {
  assert.match(page, /GAME_STAGE_OPTIONS\.filter\(\(\[stage\]\) => !\['voting', 'results'\]\.includes\(stage\)\)/);
  assert.match(page, /确认切换婚礼流程/);
  assert.match(page, /type: 'setStage'/);
  assert.match(page, /团队挑战分保持冻结/);
  assert.match(data, /setHostGameStage/);
  assert.match(data, /rpc\('set_game_stage_for_run'/);
});

test('host can enter team challenge, settle clues, and then unlock the final vote', () => {
  assert.match(page, /HOST_STAGE_OPTIONS/);
  assert.match(page, /runStageChange\(pendingStage\)/);
  assert.match(page, /data\.game\?\.stage !== 'group_game'/);
  assert.match(page, /settle-team-clues/);
  assert.match(page, /team_clues_settled_at/);
  assert.match(data, /settleHostTeamChallengeClues/);
  assert.match(page, /请先在上方把婚礼流程切换到“团队挑战”/);
  assert.match(data, /请先在主持人流程台切换到团队挑战/);
});
