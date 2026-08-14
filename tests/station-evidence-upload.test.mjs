import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('staff evidence changes are authenticated, same-origin, validated, and audited', async () => {
  const [route, migration] = await Promise.all([
    readFile(new URL('../app/api/station-evidence/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202607290030_staff_task_evidence.sql', import.meta.url), 'utf8'),
  ]);

  assert.equal((route.match(/assertSameOrigin\(request\)/g) ?? []).length, 3);
  assert.equal((route.match(/await requireAdmin\(\)/g) ?? []).length, 3);
  assert.equal((route.match(/requiredUuid\(body\.assignmentId, '任务 ID'\)/g) ?? []).length, 3);
  assert.match(route, /requiredString\(body\.path, '照片路径', 250\)/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|supabaseServiceRoleKey/);

  assert.match(migration, /v_status not in \('assigned','rejected','submitted'\)/);
  assert.match(migration, /bucket_id='task-evidence' and name=v_expected_path/);
  assert.match(migration, /'assignment\.evidence\.staff_confirm'/);
  assert.match(migration, /'assignment\.evidence\.staff_clear'/);
  assert.match(migration, /revoke all on function confirm_assignment_evidence_staff\(uuid,text,text\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function clear_assignment_evidence_staff\(uuid,text\) to service_role/);
});

test('staff uploads use deterministic private paths and never accept a client guest id', async () => {
  const [source, migration] = await Promise.all([
    readFile(new URL('../lib/data/evidence.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608130018_lock_signed_uploads_to_rehearsal_run.sql', import.meta.url), 'utf8'),
  ]);
  const stationUpload = source.slice(source.indexOf('export async function createStaffEvidenceUpload'), source.indexOf('export async function confirmStaffEvidence'));

  assert.match(source, /\.select\('id,guest_id,status,task:tasks!assignments_task_id_fkey\(stage,category,verification_type\)'\)/);
  assert.match(stationUpload, /\.rpc\('authorize_staff_assignment_evidence_upload_for_run'/);
  assert.match(stationUpload, /requireEditableStaffAssignment\(assignmentId\)/);
  assert.match(stationUpload, /createSignedUploadUrl\(path, \{ upsert: true \}\)/);
  assert.doesNotMatch(stationUpload, /guestId: string/);
  const authorization = migration.slice(
    migration.indexOf('create or replace function authorize_staff_assignment_evidence_upload'),
    migration.indexOf('create or replace function confirm_guest_avatar'),
  );
  assert.match(authorization, /v_assignment_status not in\('assigned','rejected','submitted'\)/);
  assert.match(authorization, /return v_guest_id::text\|\|'\/'\|\|v_run_id::text\|\|'\/'\|\|p_assignment_id::text\|\|'\.jpg'/);
  assert.match(source, /\.rpc\('confirm_assignment_evidence_staff_for_run'/);
  assert.match(source, /\.rpc\('clear_assignment_evidence_staff_for_run'/);
});

test('task station compresses photos and locks evidence controls offline or after approval', async () => {
  const source = await readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /import \{ compressTaskEvidence \} from '@\/lib\/client-image'/);
  assert.match(source, /fetch\('\/api\/station-evidence'/);
  assert.match(source, /method: 'PUT'.*'Content-Type': 'image\/jpeg'/s);
  assert.match(source, /type="file" accept="image\/\*"/);
  assert.match(source, /const actionOpen = isTaskActionOpenAtStage\(assignment\.task\?\.stage, data\.game\?\.stage\)/);
  assert.match(source, /!finalResultsLocked && actionOpen && acceptsStaffPhoto && \['assigned','submitted','rejected'\]\.includes\(assignment\.status\)/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| evidenceBusyId === assignment\.id\}/);
  assert.match(source, /工作人员验证照片已安全保存/);
});
