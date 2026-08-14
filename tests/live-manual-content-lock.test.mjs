import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = await read('supabase/migrations/202608130019_lock_manual_content_to_live_run.sql');
const adminData = await read('lib/data/admin.ts');
const stationData = await read('lib/data/station.ts');
const settledClues = await read('lib/data/settled-team-clues.ts');
const adminPage = await read('app/admin/page.tsx');
const stationPage = await read('app/station/page.tsx');

test('manual clue recovery only accepts exact clue ids from this rehearsal latest team settlement', () => {
  const grant = migration.slice(
    migration.indexOf('create or replace function grant_guest_clue'),
    migration.indexOf('create or replace function validate_manual_task_assignment'),
  );
  assert.match(grant, /a\.action='phase_two\.team_clues_settle'/);
  assert.match(grant, /a\.details->>'team'=v_guest\.team/);
  assert.match(grant, /select max\(r\.created_at\)[\s\S]*r\.action='rehearsal\.reset'/);
  assert.match(grant, /order by a\.created_at desc,a\.id desc[\s\S]*limit 1/);
  assert.match(grant, /coalesce\(v_settled_clue_ids,'\[\]'::jsonb\) \? p_clue_id::text/);
  assert.match(grant, /message='clue_not_earned_in_current_rehearsal'/);
  assert.doesNotMatch(grant, /select[\s\S]{0,80}from guest_clues/);
  assert.match(grant, /results_published_at is not null[\s\S]*exists\(select 1 from result_rewards\)/);
  const settlement = migration.slice(
    migration.indexOf('create or replace function settle_phase_two_team_clues'),
    migration.indexOf('create or replace function validate_manual_task_assignment'),
  );
  assert.match(settlement, /'clue_ids',to_jsonb\(v_clue_ids\)/);
  assert.match(settlement, /'phase_two\.team_clues_settle','team',v_team\.team,v_team_result/);
});

test('admin and station derive recovery choices from settlement audits, not clue-library membership', () => {
  assert.match(adminData, /settledClueIdsByTeam\(results\[19\]\.data \?\? \[\]\)/);
  assert.match(adminData, /settledTeamClueIds/);
  assert.match(stationData, /settledClueIdsByTeam\(settlementAudit\.data \?\? \[\]\)/);
  assert.match(settledClues, /entry\.action !== 'phase_two\.team_clues_settle'/);
  assert.match(settledClues, /entry\.created_at <= latestResetAt/);
  assert.match(settledClues, /if \(!team \|\| result\[team\]\) continue/);
  assert.match(adminPage, /settledClueIdsForSelectedTeam\.has\(clue\.id\)/);
  assert.match(adminPage, /新增线索不会进入本轮补发列表/);
  assert.match(stationPage, /只显示本轮系统已经选中并发给同队成员的线索/);
});

test('live catalogue rejects custom task writes and assignment at database boundary', () => {
  assert.match(migration, /guard_live_custom_task_catalog/);
  assert.match(migration, /task_catalog_mode from game_state where id=1\)='live'[\s\S]*new\.mission_code is null/);
  assert.match(migration, /before insert or update on tasks/);
  assert.match(migration, /guard_live_custom_task_assignment/);
  assert.match(migration, /before insert or update of task_id on assignments/);
  assert.match(migration, /exists\(select 1 from tasks t where t\.id=new\.task_id and t\.mission_code is null\)/);
  assert.match(migration, /if v_state\.task_catalog_mode='live'[\s\S]*live_custom_task_assignment_forbidden/);
  assert.match(migration, /if v_mode='live'[\s\S]*live_custom_task_catalog_locked/);
  assert.match(migration, /save_game_task_before_live_catalog_lock/);
  assert.match(migration, /update tasks set is_demo=true where id=v_id and mission_code is null/);
});

test('live staff UI hides custom task creation and manual assignment while demo keeps them', () => {
  assert.match(adminPage, /data\.game\?\.task_catalog_mode === 'demo' \? <form[\s\S]*演示任务派发/);
  assert.match(adminPage, /正式婚礼不开放临时任务/);
  assert.match(adminPage, /data\.game\?\.task_catalog_mode === 'demo' && <option value="new">＋ 新建演示任务/);
  assert.match(adminPage, /data\.game\?\.task_catalog_mode === 'live' \? <div className="tool-empty-state"><strong>正式模式已锁定任务清单/);
  assert.match(stationPage, /data\.game\?\.task_catalog_mode === 'demo' \? <form className="section-card"/);
  assert.match(stationPage, /正式任务清单已锁定/);
  assert.match(stationData, /game\.data\?\.task_catalog_mode === 'demo' \? \(tasks\.data \?\? \[\]\) : \[\]/);
});
