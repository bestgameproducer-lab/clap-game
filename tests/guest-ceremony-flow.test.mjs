import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607310023_ceremony_end_stage.sql', import.meta.url);
const finalizationFixUrl = new URL('../supabase/migrations/202607310024_fix_ceremony_end_finalization.sql', import.meta.url);
const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);
const adminPageUrl = new URL('../app/admin/page.tsx', import.meta.url);
const stylesUrl = new URL('../app/styles.css', import.meta.url);

test('ceremony end resumes phase one without unlocking act two', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /'task_round_1','ceremony_end','task_round_2'/);
  assert.match(migration, /select p_stage in \('registration','waiting','ceremony_end','task_round_2','group_game'\)/);
  assert.match(migration, /if p_stage='task_round_2'[\s\S]+perform finalize_phase_one_content\(p_actor\);[\s\S]+unlock_phase_two_missions\(p_actor\)/);
  assert.doesNotMatch(migration.slice(0, migration.indexOf("if p_stage='task_round_2'")), /unlock_phase_two_missions/);
  assert.doesNotMatch(migration, /delete from|truncate table|drop table/);
});

test('ceremony end is accepted by the phase-one finalizer before act two', async () => {
  const migration = await readFile(finalizationFixUrl, 'utf8');
  assert.match(migration, /'task_round_1','ceremony_end','task_round_2'/);
  assert.match(migration, /phase_one_finalize_stage_patch_verification_failed/);
  assert.doesNotMatch(migration, /update guests|update assignments|delete from|truncate/);
});

test('admin exposes ceremony end and a separate act-two transition', async () => {
  const admin = await readFile(adminPageUrl, 'utf8');
  assert.match(admin, /LIVE_FLOW_STAGES = \['registration', 'waiting', 'task_round_1', 'ceremony_end', 'task_round_2', 'group_game'\]/);
  assert.match(admin, /第一阶段任务提交和伙伴配对会重新开放，但第二阶段任务仍保持关闭/);
  assert.match(admin, /系统会结束第一阶段、处理尚未配对的最终角色，并一次性创建第二阶段任务/);
});

test('stage changes use an in-page confirmation instead of a fragile browser dialog', async () => {
  const [admin, styles] = await Promise.all([
    readFile(adminPageUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);
  const stageFlow = admin.slice(admin.indexOf('function stageTransitionWarning'), admin.indexOf('function toggleVoting'));

  assert.match(stageFlow, /setPendingStage\(stage\)/);
  assert.match(stageFlow, /confirmStageChange/);
  assert.match(admin, /<form className="stage-confirmation"/);
  assert.match(admin, /type="submit"/);
  assert.match(admin, /切换失败：\{stageError\}/);
  assert.doesNotMatch(stageFlow, /window\.confirm/);
  assert.match(admin, /role="alert" aria-live="assertive"/);
  assert.match(admin, /确认开启第二阶段/);
  assert.match(styles, /\.stage-confirmation/);
});

test('login baselines existing content and never reports a completed assignment as new', async () => {
  const guest = await readFile(guestPageUrl, 'utf8');
  assert.match(guest, /guestId: nextData\.guest\.id/);
  assert.match(guest, /previousSnapshot && previousSnapshot\.guestId === nextSnapshot\.guestId/);
  assert.match(guest, /\['assigned', 'rejected'\]\.includes\(assignment\.status\)/);
  assert.match(guest, /contentSnapshotRef\.current = null; setContentNotice\(null\)/);
});
