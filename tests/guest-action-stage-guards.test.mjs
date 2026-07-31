import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isPhaseOneInteractionOpenAtStage, isTaskActionOpenAtStage, isTaskPausedDuringCeremony } from '../lib/game-rules.ts';

const migrationUrl = new URL('../supabase/migrations/202607290033_guest_action_stage_guards.sql', import.meta.url);
const ceremonyMigrationUrl = new URL('../supabase/migrations/202607300006_align_submission_windows_with_ceremony.sql', import.meta.url);

test('phase-one submissions open before and after the ceremony but pause during it', () => {
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'registration'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'waiting'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'task_round_1'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'ceremony_end'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'task_round_2'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'group_game'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_2', 'task_round_1'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_2', 'ceremony_end'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_2', 'group_game'), true);
  assert.equal(isTaskActionOpenAtStage('group_game', 'group_game'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'voting'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'results'), false);
  assert.equal(isTaskActionOpenAtStage(undefined, 'task_round_1'), false);
  assert.equal(isTaskActionOpenAtStage('unexpected', 'task_round_1'), false);
  assert.equal(isTaskActionOpenAtStage('task_round_1', 'unexpected'), false);
  assert.equal(isPhaseOneInteractionOpenAtStage('registration'), true);
  assert.equal(isPhaseOneInteractionOpenAtStage('waiting'), true);
  assert.equal(isPhaseOneInteractionOpenAtStage('task_round_1'), false);
  assert.equal(isPhaseOneInteractionOpenAtStage('ceremony_end'), true);
  assert.equal(isPhaseOneInteractionOpenAtStage('task_round_2'), true);
  assert.equal(isTaskPausedDuringCeremony('task_round_1', 'task_round_1'), true);
  assert.equal(isTaskPausedDuringCeremony('task_round_2', 'task_round_1'), false);
});

test('database follows the real ceremony submission windows', async () => {
  const migration = await readFile(ceremonyMigrationUrl, 'utf8');
  assert.match(migration, /select p_stage in \('registration','waiting','task_round_2','group_game'\)/);
  assert.match(migration, /v_task_stage='task_round_1' and phase_one_interactions_open\(v_game_stage\)/);
  assert.equal((migration.match(/if not phase_one_interactions_open\(v_stage\)/g) ?? []).length, 5);
  const setStage = migration.slice(migration.indexOf('create or replace function set_game_stage'), migration.indexOf('create or replace function set_game_flag'));
  assert.doesNotMatch(setStage, /finalize_phase_one_content/);
  const setFlag = migration.slice(migration.indexOf('create or replace function set_game_flag'));
  assert.match(setFlag, /if v_state\.phase_one_completed_at is null then\s+perform finalize_phase_one_content\(p_actor\)/);
  assert.match(migration, /a\.status in\('assigned','rejected'\)/);
  assert.doesNotMatch(migration, /a\.status in\('assigned','submitted','rejected'\)/);
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
  assert.match(page, /isTaskWaitingForStage/);
  assert.match(page, /抽卡入口暂未开放/);
  assert.match(page, /婚礼仪式进行中，照片上传和任务提交暂时暂停；仪式结束后会自动恢复/);
  assert.match(page, /照片上传、任务提交和玩家确认暂时暂停/);
  assert.match(page, /本环节已停止提交/);
  assert.match(evidence, /task:tasks!assignments_task_id_fkey\(stage\)/);
  assert.match(evidence, /isTaskActionOpenAtStage\(task\?\.stage, game\?\.stage\)/);
  assert.equal((evidence.match(/await requireEditableGuestAssignment\(assignmentId, guestId\)/g) ?? []).length, 3);
});
