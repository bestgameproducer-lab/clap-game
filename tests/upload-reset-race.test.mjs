import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/202608130018_lock_signed_uploads_to_rehearsal_run.sql';

function functionBody(source, name, nextName) {
  const start = source.indexOf(`create or replace function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? source.indexOf(`create or replace function ${nextName}`, start) : source.length;
  assert.notEqual(end, -1, `${name} must have a bounded body`);
  return source.slice(start, end);
}

test('signed upload authorization is serialized with rehearsal reset', async () => {
  const migration = await read(migrationPath);
  const functions = [
    ['authorize_guest_avatar_upload', 'authorize_guest_assignment_evidence_upload'],
    ['authorize_guest_assignment_evidence_upload', 'authorize_staff_assignment_evidence_upload'],
    ['authorize_staff_assignment_evidence_upload', 'confirm_guest_avatar'],
    ['confirm_guest_avatar', 'confirm_assignment_evidence'],
    ['confirm_assignment_evidence', 'confirm_assignment_evidence_staff'],
    ['confirm_assignment_evidence_staff', null],
  ];

  for (const [name, nextName] of functions) {
    const body = functionBody(migration, name, nextName);
    const resetLock = body.indexOf("pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'))");
    const gameRead = body.indexOf('from game_state where id=1 for share');
    assert.ok(resetLock >= 0, `${name} must share-lock the reset boundary`);
    assert.ok(gameRead > resetLock, `${name} must lock the reset boundary before reading game state`);
    assert.match(body, /results_published_at is not null or exists\(select 1 from result_rewards\)/);
  }
});

test('authorization returns only a current run-scoped path for a claimed guest and assignment', async () => {
  const migration = await read(migrationPath);
  const avatar = functionBody(migration, 'authorize_guest_avatar_upload', 'authorize_guest_assignment_evidence_upload');
  const guestEvidence = functionBody(migration, 'authorize_guest_assignment_evidence_upload', 'authorize_staff_assignment_evidence_upload');
  const staffEvidence = functionBody(migration, 'authorize_staff_assignment_evidence_upload', 'confirm_guest_avatar');

  assert.match(avatar, /where id=p_guest_id and active and uses_app[\s\S]*for share/);
  assert.match(avatar, /v_claimed_at is null[\s\S]*avatar_guest_not_claimed/);
  assert.match(avatar, /return p_guest_id::text\|\|'\/'\|\|v_run_id::text\|\|'\.jpg'/);

  assert.match(guestEvidence, /a\.id=p_assignment_id and a\.guest_id=p_guest_id/);
  assert.match(guestEvidence, /for share of a,g/);
  assert.match(guestEvidence, /v_claimed_at is null[\s\S]*assignment_guest_not_claimed/);
  assert.match(guestEvidence, /v_assignment_status not in\('assigned','rejected'\)/);
  assert.match(guestEvidence, /message='assignment_stage_closed'/);
  assert.match(guestEvidence, /return p_guest_id::text\|\|'\/'\|\|v_run_id::text\|\|'\/'\|\|p_assignment_id::text\|\|'\.jpg'/);

  assert.match(staffEvidence, /v_assignment_status not in\('assigned','rejected','submitted'\)/);
  assert.match(staffEvidence, /v_claimed_at is null[\s\S]*assignment_guest_not_claimed/);
});

test('confirmation rechecks the current run, claimed guest, assignment, and object', async () => {
  const migration = await read(migrationPath);
  const avatar = functionBody(migration, 'confirm_guest_avatar', 'confirm_assignment_evidence');
  const guestEvidence = functionBody(migration, 'confirm_assignment_evidence', 'confirm_assignment_evidence_staff');
  const staffEvidence = functionBody(migration, 'confirm_assignment_evidence_staff', null);

  assert.match(avatar, /where id=p_guest_id and active and uses_app[\s\S]*for update/);
  assert.match(avatar, /v_claimed_at is null[\s\S]*avatar_guest_not_claimed/);
  assert.match(avatar, /p_avatar_path is distinct from v_expected_path/);
  assert.match(avatar, /bucket_id='guest-avatars' and name=v_expected_path/);

  for (const body of [guestEvidence, staffEvidence]) {
    assert.match(body, /for update of a,g/);
    assert.match(body, /v_claimed_at is null[\s\S]*assignment_guest_not_claimed/);
    assert.match(body, /p_evidence_path is distinct from v_expected_path/);
    assert.match(body, /bucket_id='task-evidence' and name=v_expected_path/);
  }
  assert.match(guestEvidence, /message='assignment_stage_closed'/);
});

test('server code asks the database for the authorized path instead of assembling split snapshots', async () => {
  const [avatar, evidence] = await Promise.all([
    read('lib/data/avatar.ts'),
    read('lib/data/evidence.ts'),
  ]);

  assert.match(avatar, /\.rpc\('authorize_guest_avatar_upload'/);
  assert.doesNotMatch(avatar, /guestAvatarPath|select\('rehearsal_run_id/);

  assert.match(evidence, /\.rpc\('authorize_guest_assignment_evidence_upload'/);
  assert.match(evidence, /\.rpc\('authorize_staff_assignment_evidence_upload_for_run'/);
  assert.doesNotMatch(evidence, /assignmentEvidencePath|currentRehearsalRunId/);

  const guestConfirm = evidence.slice(evidence.indexOf('export async function confirmGuestEvidence'), evidence.indexOf('export async function removeGuestEvidence'));
  const staffConfirm = evidence.slice(evidence.indexOf('export async function confirmStaffEvidence'), evidence.indexOf('export async function removeStaffEvidence'));
  assert.doesNotMatch(guestConfirm, /requireEditableGuestAssignment/);
  assert.doesNotMatch(staffConfirm, /requireEditableStaffAssignment/);
});

test('new upload RPCs remain service-role only', async () => {
  const migration = await read(migrationPath);
  for (const signature of [
    'authorize_guest_avatar_upload\\(uuid\\)',
    'authorize_guest_assignment_evidence_upload\\(uuid,uuid\\)',
    'authorize_staff_assignment_evidence_upload\\(uuid\\)',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function ${signature}\\s+from public,anon,authenticated`));
    assert.match(migration, new RegExp(`grant execute on function ${signature} to service_role`));
  }
});
