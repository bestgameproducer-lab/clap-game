import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('operator stage controls expose only the next legal wedding stage', async () => {
  const [stages, admin, host, adminData, hostData] = await Promise.all([
    read('lib/game-stages.ts'), read('app/admin/page.tsx'), read('app/host/page.tsx'),
    read('lib/data/admin.ts'), read('lib/data/host.ts'),
  ]);
  assert.match(stages, /LIVE_GAME_STAGE_SEQUENCE/);
  assert.match(stages, /isNextLiveGameStage/);
  assert.match(admin, /!isNextLiveGameStage\(data\.game\?\.stage, stage\)/);
  assert.match(host, /!isNextLiveGameStage\(data\.game\?\.stage, stage\)/);
  assert.match(adminData, /invalid_game_stage_transition/);
  assert.match(hostData, /invalid_game_stage_transition/);
});

test('a closed voting round can be followed by a new voting round', async () => {
  const host = await read('app/host/page.tsx');
  assert.match(host, /!\['group_game', 'voting'\]\.includes\(data\.game\?\.stage \|\| ''\) \|\| !data\.game\?\.team_clues_settled_at/);
});

test('stage notes clear atomically and inactive guests cannot receive awards', async () => {
  const [migration, admin] = await Promise.all([
    read('supabase/migrations/202608130027_close_operator_consistency_gaps.sql'),
    read('app/admin/page.tsx'),
  ]);
  assert.match(migration, /before update of stage on game_state/);
  assert.match(migration, /new\.phase_note:=null/);
  assert.match(migration, /message='award_guest_inactive'/);
  assert.match(migration, /where g\.id=new\.winner_guest_id and g\.active/);
  assert.match(admin, /id="award-guest"[\s\S]*?\{activeGuests\.map/);
  const stageConfirmation = admin.slice(admin.indexOf('async function confirmStageChange'), admin.indexOf('function toggleVoting'));
  assert.doesNotMatch(stageConfirmation, /action\(\{ type: 'setGuestPhaseNote'/);
  assert.match(stageConfirmation, /setGuestPhaseNote\(''\)/);
});

test('task station completion respects task windows and excludes hidden work', async () => {
  const [migration, station] = await Promise.all([
    read('supabase/migrations/202608130027_close_operator_consistency_gaps.sql'),
    read('app/station/page.tsx'),
  ]);
  assert.match(migration, /v_task_category='hidden'/);
  assert.match(migration, /message='station_hidden_assignment_forbidden'/);
  assert.match(migration, /v_task_stage='task_round_1' and not phase_one_interactions_open\(v_game_stage\)/);
  assert.match(migration, /v_task_stage='task_round_2' and v_game_stage not in\('task_round_2','banquet','group_game'\)/);
  assert.match(migration, /message='assignment_stage_closed'/);
  assert.match(migration, /from public,anon,authenticated,service_role/);
  assert.doesNotMatch(migration, /grant execute on function complete_assignment_at_station\(uuid,text,text\)/);
  assert.match(station, /isTaskActionOpenAtStage\(assignment\.task\?\.stage, data\.game\?\.stage\)/);
  assert.match(station, /当前环节暂停核验，流程开放后再处理/);
});

test('host private roster is never restored from persistent browser storage', async () => {
  const host = await read('app/host/page.tsx');
  assert.doesNotMatch(host, /sessionStorage\.setItem\([^\n]*JSON\.stringify\(body\)/);
  assert.doesNotMatch(host, /sessionStorage\.getItem\(HOST_CACHE_KEY\)/);
  assert.match(host, /never restore private identities from disk/);
});
