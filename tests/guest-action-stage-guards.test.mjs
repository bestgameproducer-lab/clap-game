import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isTaskActionOpenAtStage } from '../lib/game-rules.ts';

const migrationUrl = new URL('../supabase/migrations/202607290033_guest_action_stage_guards.sql', import.meta.url);

test('guest task actions are open only while their task stage is active', () => {
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'registration'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'task_round_1'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'task_round_2'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_2', 'task_round_1'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_2', 'group_game'), true);
  assert.equal(isTaskActionOpenAtStage('group_game', 'group_game'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'voting'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'results'), false);
  assert.equal(isTaskActionOpenAtStage(undefined, 'task_round_1'), false);
  assert.equal(isTaskActionOpenAtStage('unexpected', 'task_round_1'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'unexpected'), false);
});

test('database gates new draws and task submissions with locked game state', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const draw = migration.slice(migration.indexOf('create function draw_guest_card'), migration.indexOf('create or replace function submit_assignment'));
  const submit = migration.slice(migration.indexOf('create or replace function submit_assignment'), migration.indexOf('create or replace function redeem_hidden_task_code'));

  assert.ok(draw.indexOf("select registration_open into v_registration_open from game_state where id=1 for share") < draw.indexOf('select * into v_guest from guests'), 'game state must lock before guest rows');
  assert.match(draw, /if v_guest\.drawn_at is not null then/);
  assert.match(draw, /message='draw_registration_closed'/);
  assert.match(submit, /from assignments a join tasks t on t\.id=a\.task_id/);
  assert.match(submit, /for update of a/);
  assert.match(submit, /select stage into v_game_stage from game_state where id=1 for share/);
  assert.ok(submit.indexOf('select stage into v_game_stage') < submit.indexOf('from assignments a join tasks'), 'game state must lock before assignment rows');
  assert.match(submit, /v_game_stage='group_game' and v_task_stage in \('task_round_1','task_round_2','group_game'\)/);
  assert.match(submit, /message='assignment_stage_closed'/);
});

test('physical hidden cards redeem only during their intended window', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const redeem = migration.slice(migration.indexOf('create or replace function redeem_hidden_task_code'));
  assert.match(redeem, /v_game_stage not in \('task_round_2','group_game'\)/);
  assert.ok(redeem.indexOf('select stage into v_game_stage') < redeem.indexOf('select * into v_code'), 'game state must lock before code and guest rows');
  assert.match(redeem, /message='hidden_task_stage_closed'/);
  assert.match(redeem, /revoke all on function redeem_hidden_task_code\(uuid,text,text\)/);
  assert.match(redeem, /grant execute on function redeem_hidden_task_code\(uuid,text,text\) to service_role/);
});

test('mobile guest page explains closed action windows', async () => {
  const [page, evidence] = await Promise.all([
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/evidence.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /isTaskActionOpenAtStage/);
  assert.match(page, /抽卡入口暂未开放/);
  assert.match(page, /本环节已停止提交/);
  assert.match(evidence, /task:tasks!assignments_task_id_fkey\(stage\)/);
  assert.match(evidence, /isTaskActionOpenAtStage\(task\?\.stage, game\?\.stage\)/);
  assert.equal((evidence.match(/await requireEditableGuestAssignment\(assignmentId, guestId\)/g) ?? []).length, 3);
});
