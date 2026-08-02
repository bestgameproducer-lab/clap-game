import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290031_game_stage_state_machine.sql', import.meta.url);

test('manual stages cannot bypass voting rounds or result settlement', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const stageFunction = migration.slice(migration.indexOf('create or replace function set_game_stage'), migration.indexOf('create or replace function set_game_flag'));

  assert.match(stageFunction, /p_stage in \('voting','results'\)/);
  assert.match(stageFunction, /message='use_voting_controls'/);
  assert.match(stageFunction, /select \* into v_state from game_state where id=1 for update/);
  assert.match(stageFunction, /voting_open=false/);
  assert.match(stageFunction, /results_visible=false/);
  for (const field of ['current_host_segment_id=null', 'display_title=null', 'display_body=null', 'public_clue=null', 'timer_ends_at=null']) {
    assert.ok(stageFunction.includes(field), `manual stage change must clear ${field}`);
  }
  assert.match(stageFunction, /'previous_stage',v_state\.stage/);
});

test('voting controls close registration and keep the finale state coherent', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const flagFunction = migration.slice(migration.indexOf('create or replace function set_game_flag'), migration.indexOf('create or replace function set_registration_open'));

  assert.match(flagFunction, /v_state\.stage not in \('group_game','voting','results'\)/);
  assert.match(flagFunction, /not exists\(select 1 from guests where active and drawn_at is not null\)/);
  assert.match(flagFunction, /registration_open=false/);
  assert.match(flagFunction, /voting_round=voting_round\+1/);
  assert.match(flagFunction, /perform settle_voting_results\(v_state\.voting_round,p_actor\)/);
  assert.match(flagFunction, /perform settle_spy_results\(v_state\.voting_round,p_actor\)/);
  assert.match(flagFunction, /stage=case when stage='results' then 'voting' else stage end/);
  assert.match(flagFunction, /'stage',\(select stage from game_state where id=1\)/);
});

test('registration cannot reopen during voting or reveal', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const registration = migration.slice(migration.indexOf('create or replace function set_registration_open'), migration.indexOf('revoke all on function set_game_stage'));
  assert.match(registration, /p_value and \(v_state\.voting_open or v_state\.results_visible or v_state\.stage in \('voting','results'\)\)/);
  assert.match(registration, /message='registration_during_finale'/);
  assert.match(migration, /revoke all on function set_registration_open\(boolean,text\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function set_registration_open\(boolean,text\) to service_role/);
});

test('admin route and controls cannot directly select finale stages', async () => {
  const [rules, route, page, data] = await Promise.all([
    readFile(new URL('../lib/game-rules.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(rules, /MANUAL_GAME_STAGES = \['registration', 'waiting', 'task_round_1', 'ceremony_end', 'task_round_2', 'banquet', 'group_game'\]/);
  assert.match(route, /requiredEnum\(body\.stage, '游戏阶段', MANUAL_GAME_STAGES\)/);
  assert.match(page, /disabled=\{\['voting', 'results'\]\.includes\(value\)\}/);
  assert.match(page, /系统会关闭当前投票、隐藏揭晓，并清空大屏/);
  assert.match(page, /开启一轮新的最终投票.*关闭宾客注册、清空大屏旧题目/s);
  assert.match(page, /已经结算的个人和团队积分不会撤销/);
  assert.match(page, /终局期间不可开放/);
  for (const code of ['use_voting_controls', 'voting_stage_not_ready', 'no_drawn_guests', 'registration_during_finale']) {
    assert.ok(data.includes(code), `missing friendly error for ${code}`);
  }
});
