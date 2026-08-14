import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const runtimeRpcs = [
  ['set_game_stage_for_run', 'text,text,uuid'],
  ['set_game_flag_for_run', 'text,boolean,text,uuid'],
  ['set_registration_open_for_run', 'boolean,text,uuid'],
  ['set_guest_phase_note_for_run', 'text,text,uuid'],
  ['set_live_display_for_run', 'text,text,text,integer,text,uuid'],
  ['settle_phase_two_team_clues_for_run', 'text,uuid'],
];

test('every live workflow wrapper fails closed against the displayed rehearsal run', async () => {
  const migration = await read('supabase/migrations/202608130021_scope_runtime_controls_to_rehearsal.sql');

  for (const [rpc, signature] of runtimeRpcs) {
    const start = migration.indexOf(`create or replace function ${rpc}`);
    assert.ok(start >= 0, `${rpc} wrapper must exist`);
    const next = migration.indexOf('create or replace function ', start + 1);
    const definition = migration.slice(start, next < 0 ? migration.indexOf('-- Server application code') : next);
    assert.match(definition, /perform assert_current_rehearsal_run\(p_rehearsal_run_id\)/);
    assert.match(migration, new RegExp(`revoke all on function ${rpc}\\(${signature}\\) from public,anon,authenticated`));
    assert.match(migration, new RegExp(`grant execute on function ${rpc}\\(${signature}\\) to service_role`));
  }

  for (const [rpc, signature] of [
    ['set_game_stage', 'text,text'],
    ['set_game_flag', 'text,boolean,text'],
    ['set_registration_open', 'boolean,text'],
    ['set_guest_phase_note', 'text,text'],
    ['set_live_display', 'text,text,text,integer,text'],
    ['settle_phase_two_team_clues', 'text'],
  ]) {
    assert.match(migration, new RegExp(`revoke all on function ${rpc}\\(${signature}\\) from public,anon,authenticated,service_role`));
  }
});

test('admin and host validate and forward current run ids for runtime controls', async () => {
  const [adminRoute, hostRoute, adminData, hostData, adminPage, hostPage] = await Promise.all([
    read('app/api/admin-action/route.ts'),
    read('app/api/host-action/route.ts'),
    read('lib/data/admin.ts'),
    read('lib/data/host.ts'),
    read('app/admin/page.tsx'),
    read('app/host/page.tsx'),
  ]);

  for (const route of [adminRoute, hostRoute]) {
    assert.match(route, /const currentRunId = \(\) => requiredUuid\(body\.rehearsalRunId, '婚礼运行批次'\)/);
    assert.match(route, /toggleVoting[\s\S]*?currentRunId\(\)/);
    assert.match(route, /settleTeamClues[\s\S]*?currentRunId\(\)/);
    assert.match(route, /setStage[\s\S]*?currentRunId\(\)/);
  }
  assert.match(adminRoute, /toggleRegistration[\s\S]*?currentRunId\(\)/);
  assert.match(adminRoute, /setGuestPhaseNote[\s\S]*?currentRunId\(\)/);
  assert.match(adminRoute, /setLiveDisplay[\s\S]*?currentRunId\(\)/);
  assert.match(adminRoute, /toggleScoreboard[\s\S]*?currentRunId\(\)/);
  assert.match(hostRoute, /publishResults[\s\S]*?currentRunId\(\)/);

  for (const rpc of runtimeRpcs.map(([name]) => name)) {
    assert.match(`${adminData}\n${hostData}`, new RegExp(`rpc\\('${rpc}'`));
  }
  for (const data of [adminData, hostData]) assert.match(data, /p_rehearsal_run_id: rehearsalRunId/);

  assert.match(adminPage, /JSON\.stringify\(\{ \.\.\.body, rehearsalRunId: data\?\.game\?\.rehearsal_run_id \}\)/);
  assert.match(hostPage, /JSON\.stringify\(\{ \.\.\.request, rehearsalRunId: data\?\.game\?\.rehearsal_run_id \}\)/);
  assert.match(hostPage, /JSON\.stringify\(\{ type: 'setStage', stage, rehearsalRunId: data\?\.game\?\.rehearsal_run_id \}\)/);
});

test('run scoping does not bind stable wedding configuration to a rehearsal', async () => {
  const [migration, adminData] = await Promise.all([
    read('supabase/migrations/202608130021_scope_runtime_controls_to_rehearsal.sql'),
    read('lib/data/admin.ts'),
  ]);

  for (const stableRpc of ['set_invitation_code', 'save_game_task']) {
    assert.doesNotMatch(migration, new RegExp(`${stableRpc}_for_run`));
    assert.match(adminData, new RegExp(`rpc\\('${stableRpc}'`));
  }
});
