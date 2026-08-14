import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/202608130024_scope_staff_runtime_mutations_to_rehearsal.sql';

const wrappers = [
  ['approve_assignment_with_verification_for_run', 'approve_assignment_with_verification'],
  ['reject_assignment_for_run', 'reject_assignment'],
  ['complete_assignment_at_station_for_run', 'complete_assignment_at_station'],
  ['assign_task_to_guest_for_run', 'assign_task_to_guest'],
  ['reassign_task_assignment_for_run', 'reassign_task_assignment'],
  ['update_ceremony_assignment_for_run', 'update_ceremony_assignment'],
  ['grant_guest_clue_for_run', 'grant_guest_clue'],
  ['undo_player_relationship_for_run', 'undo_player_relationship'],
  ['authorize_staff_assignment_evidence_upload_for_run', 'authorize_staff_assignment_evidence_upload'],
  ['confirm_assignment_evidence_staff_for_run', 'confirm_assignment_evidence_staff'],
  ['clear_assignment_evidence_staff_for_run', 'clear_assignment_evidence_staff'],
];

function functionBody(source, name) {
  const start = source.indexOf(`create or replace function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf('create or replace function ', start + 1);
  return source.slice(start, end < 0 ? source.indexOf('-- Only the run-scoped wrappers', start) : end);
}

test('every rehearsal-owned staff mutation validates the displayed run before delegating', async () => {
  const migration = await read(migrationPath);
  for (const [wrapper, canonical] of wrappers) {
    const body = functionBody(migration, wrapper);
    const assertion = body.indexOf('perform assert_current_rehearsal_run(p_rehearsal_run_id)');
    const delegation = body.indexOf(`${canonical}(`);
    assert.ok(assertion >= 0, `${wrapper} must validate the rehearsal run`);
    assert.ok(delegation > assertion, `${wrapper} must validate before calling ${canonical}`);
  }
});

test('legacy staff runtime entry points are unavailable to service code', async () => {
  const migration = await read(migrationPath);
  const legacySignatures = [
    'approve_assignment\\(uuid,text,text\\)',
    'approve_assignment_with_verification\\(uuid,text,text\\)',
    'reject_assignment\\(uuid,text,text\\)',
    'complete_assignment_at_station\\(uuid,text,text\\)',
    'assign_task_to_guest\\(uuid,uuid,text\\)',
    'reassign_task_assignment\\(uuid,uuid,text,text\\)',
    'update_ceremony_assignment\\(uuid,text,text,text\\)',
    'grant_guest_clue\\(uuid,uuid,text\\)',
    'undo_player_relationship\\(uuid,text,text\\)',
    'authorize_staff_assignment_evidence_upload\\(uuid\\)',
    'confirm_assignment_evidence_staff\\(uuid,text,text\\)',
    'clear_assignment_evidence_staff\\(uuid,text\\)',
  ];
  for (const signature of legacySignatures) {
    if (signature.startsWith('approve_assignment\\(')) {
      const finalAudit = await read('supabase/migrations/202608130028_close_runtime_audit_gaps.sql');
      assert.match(finalAudit, new RegExp(`revoke all on function ${signature}[\\s\\S]*?from public,anon,authenticated,service_role`));
    } else {
      assert.match(migration, new RegExp(`revoke all on function ${signature}\\s+from service_role`));
    }
  }
  for (const [wrapper] of wrappers) {
    assert.match(migration, new RegExp(`grant execute on function ${wrapper}\\([\\s\\S]*?to service_role`));
  }
});

test('admin and task-station requests carry the run shown in their loaded snapshot', async () => {
  const [adminData, adminRoute, stationPage, stationEvidenceRoute, evidence] = await Promise.all([
    read('lib/data/admin.ts'),
    read('app/api/admin-action/route.ts'),
    read('app/station/page.tsx'),
    read('app/api/station-evidence/route.ts'),
    read('lib/data/evidence.ts'),
  ]);

  for (const [wrapper] of wrappers.slice(0, 8)) {
    assert.match(adminData, new RegExp(`\\.rpc\\('${wrapper}'[\\s\\S]*?p_rehearsal_run_id: rehearsalRunId`));
  }
  assert.match(adminRoute, /const currentRunId = \(\) => requiredUuid\(body\.rehearsalRunId, '婚礼运行批次'\)/);
  for (const type of ['approve', 'completeAtStation', 'reject', 'assignTask', 'reassignTask', 'updateCeremonyAssignment', 'grantClue', 'undoRelationship']) {
    const start = adminRoute.indexOf(`type === '${type}'`);
    assert.ok(start >= 0, `${type} route must exist`);
    const next = adminRoute.indexOf("type === '", start + 1);
    assert.match(adminRoute.slice(start, next < 0 ? undefined : next), /currentRunId\(\)/, `${type} must require a run`);
  }

  assert.match(stationPage, /JSON\.stringify\(\{ \.\.\.body, rehearsalRunId: data\?\.game\?\.rehearsal_run_id \}\)/);
  assert.ok((stationPage.match(/rehearsalRunId: data\?\.game\?\.rehearsal_run_id/g) ?? []).length >= 4);
  assert.equal((stationEvidenceRoute.match(/requiredUuid\(body\.rehearsalRunId, '婚礼运行批次'\)/g) ?? []).length, 3);
  for (const [wrapper] of wrappers.slice(8)) {
    assert.match(evidence, new RegExp(`\\.rpc\\('${wrapper}'[\\s\\S]*?p_rehearsal_run_id: rehearsalRunId`));
  }
});

test('credentials and task catalog remain independent of a rehearsal run', async () => {
  const adminData = await read('lib/data/admin.ts');
  for (const canonical of [
    'set_invitation_code',
    'save_game_task',
  ]) {
    assert.match(adminData, new RegExp(`\\.rpc\\('${canonical}'`));
  }
});
