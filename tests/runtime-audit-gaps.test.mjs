import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('canonical approval is not an application entry point', async () => {
  const migration = await read('supabase/migrations/202608130028_close_runtime_audit_gaps.sql');
  assert.match(migration, /revoke all on function approve_assignment\(uuid,text,text\)[\s\S]*?from public,anon,authenticated,service_role/);
});

test('staff evidence is guarded by status, hidden-task privacy and the active act window', async () => {
  const [migration, evidence] = await Promise.all([
    read('supabase/migrations/202608130028_close_runtime_audit_gaps.sql'),
    read('lib/data/evidence.ts'),
  ]);
  const guard = migration.slice(
    migration.indexOf('create or replace function assert_staff_assignment_evidence_open'),
    migration.indexOf('create or replace function authorize_staff_assignment_evidence_upload'),
  );
  assert.match(guard, /v_status not in\('assigned','rejected','submitted'\)/);
  assert.match(guard, /v_task_category='hidden'/);
  assert.match(guard, /v_task_stage='task_round_1' and not phase_one_interactions_open\(v_game_stage\)/);
  assert.match(guard, /v_task_stage='task_round_2' and v_game_stage not in\('task_round_2','banquet','group_game'\)/);
  assert.match(guard, /v_task_stage='group_game' and v_game_stage<>'group_game'/);

  for (const name of [
    'authorize_staff_assignment_evidence_upload',
    'confirm_assignment_evidence_staff',
    'clear_assignment_evidence_staff',
  ]) {
    const start = migration.indexOf(`create or replace function ${name}`);
    assert.ok(start >= 0, `${name} must exist`);
    const next = migration.indexOf('create or replace function ', start + 1);
    assert.match(migration.slice(start, next), /assert_staff_assignment_evidence_open\(p_assignment_id\)/);
  }
  assert.match(evidence, /select\('id,guest_id,status,task:tasks!assignments_task_id_fkey\(stage,category,verification_type\)'\)/);
  assert.match(evidence, /task\?\.category === 'hidden'/);
  assert.match(evidence, /task\?\.verification_type !== 'PHOTO'/);
  assert.match(evidence, /createStaffEvidenceUpload[\s\S]*?await requireEditableStaffAssignment\(assignmentId\)/);
  assert.match(evidence, /confirmStaffEvidence[\s\S]*?confirm_assignment_evidence_staff_for_run/);
  assert.match(evidence, /removeStaffEvidence[\s\S]*?await requireEditableStaffAssignment\(assignmentId, false\)/);
});

test('an exact reset retry survives rehearsal run rotation without accepting conflicting payloads', async () => {
  const migration = await read('supabase/migrations/202608130028_close_runtime_audit_gaps.sql');
  const reset = migration.slice(
    migration.indexOf('create or replace function reset_rehearsal_data_for_run'),
    migration.indexOf('-- The run-scoped wrappers remain'),
  );
  const lookup = reset.indexOf('select * into v_existing from rehearsal_resets where event_key=p_event_key');
  const returnExisting = reset.indexOf('return v_existing.summary');
  const assertRun = reset.indexOf('perform assert_current_rehearsal_run(p_rehearsal_run_id)');
  const resetCall = reset.indexOf('return reset_rehearsal_data(');
  assert.ok(lookup >= 0 && returnExisting > lookup && assertRun > returnExisting && resetCall > assertRun);
  assert.match(reset, /v_existing\.actor is distinct from p_actor/);
  assert.match(reset, /v_existing\.reason is distinct from trim\(coalesce\(p_reason,''\)\)/);
  assert.match(reset, /p_confirmation is distinct from 'RESET WEDDING'/);
  assert.match(reset, /message='reset_event_conflict'/);
});
