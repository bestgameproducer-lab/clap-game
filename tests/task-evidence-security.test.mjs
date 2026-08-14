import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290023_private_task_evidence.sql', import.meta.url);
const hardeningMigrationUrl = new URL('../supabase/migrations/202608130001_harden_rehearsal_reset_completeness.sql', import.meta.url);
const uploadHardeningMigrationUrl = new URL('../supabase/migrations/202608130018_lock_signed_uploads_to_rehearsal_run.sql', import.meta.url);

test('task evidence bucket is private, bounded, and image-only', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /values\('task-evidence','task-evidence',false,2097152,array\['image\/jpeg'\]::text\[\]\)/);
  assert.match(migration, /evidence_path text/);
  assert.match(migration, /evidence_uploaded_at timestamptz/);
  assert.ok(migration.includes("evidence_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/evidence[.]jpg$'"));
});

test('only an assignment owner can bind an uploaded object while the task is editable', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const confirm = migration.slice(migration.indexOf('create or replace function confirm_assignment_evidence'), migration.indexOf('create or replace function clear_assignment_evidence'));
  assert.match(confirm, /where id=p_assignment_id and guest_id=p_guest_id for update/);
  assert.match(confirm, /v_status not in \('assigned','rejected'\)/);
  assert.match(confirm, /p_evidence_path<>v_expected_path/);
  assert.match(confirm, /from storage\.objects/);
  assert.match(confirm, /bucket_id='task-evidence' and name=v_expected_path/);
  assert.match(migration, /revoke all on function confirm_assignment_evidence\(uuid,uuid,text\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function confirm_assignment_evidence\(uuid,uuid,text\) to service_role/);
});

test('evidence authorization API requires a guest session and same-origin mutation', async () => {
  const route = await readFile(new URL('../app/api/task-evidence/route.ts', import.meta.url), 'utf8');
  assert.equal((route.match(/assertSameOrigin\(request\)/g) ?? []).length, 3);
  assert.equal((route.match(/await requireGuestContext\(\)/g) ?? []).length, 3);
  assert.match(route, /requiredUuid\(body\.assignmentId, '任务 ID'\)/);
  assert.match(route, /requiredString\(body\.path, '照片路径', 250\)/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|supabaseServiceRoleKey/);
});

test('server issues only deterministic signed paths and short-lived read URLs', async () => {
  const [source, migration] = await Promise.all([
    readFile(new URL('../lib/data/evidence.ts', import.meta.url), 'utf8'),
    readFile(uploadHardeningMigrationUrl, 'utf8'),
  ]);
  assert.match(source, /\.rpc\('authorize_guest_assignment_evidence_upload'/);
  assert.match(source, /\.rpc\('authorize_staff_assignment_evidence_upload_for_run'/);
  assert.doesNotMatch(source, /assignmentEvidencePath|currentRehearsalRunId/);
  const guestAuthorization = migration.slice(
    migration.indexOf('create or replace function authorize_guest_assignment_evidence_upload'),
    migration.indexOf('create or replace function authorize_staff_assignment_evidence_upload'),
  );
  assert.match(guestAuthorization, /a\.id=p_assignment_id and a\.guest_id=p_guest_id/);
  assert.match(guestAuthorization, /v_assignment_status not in\('assigned','rejected'\)/);
  assert.match(guestAuthorization, /return p_guest_id::text\|\|'\/'\|\|v_run_id::text\|\|'\/'\|\|p_assignment_id::text\|\|'\.jpg'/);
  assert.match(source, /createSignedUploadUrl\(path, \{ upsert: true \}\)/);
  assert.match(source, /EVIDENCE_URL_TTL_SECONDS = 10 \* 60/);
  assert.match(source, /createSignedUrls\(paths, EVIDENCE_URL_TTL_SECONDS\)/);
});

test('formal evidence paths are isolated by rehearsal run and confirmed server-side', async () => {
  const migration = await readFile(hardeningMigrationUrl, 'utf8');
  assert.match(migration, /assignments_evidence_path_check/);
  assert.match(migration, /rehearsal_run_id/);
  assert.match(migration, /create or replace function confirm_assignment_evidence\(/);
  assert.match(migration, /create or replace function confirm_assignment_evidence_staff\(/);
  assert.match(migration, /bucket_id='task-evidence'/);
});

test('mobile client strips metadata through canvas compression before signed upload', async () => {
  const [imageSource, page] = await Promise.all([
    readFile(new URL('../lib/client-image.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(imageSource, /MAX_EVIDENCE_BYTES = 1_800_000/);
  assert.match(imageSource, /context\.drawImage/);
  assert.match(imageSource, /canvas\.toBlob/);
  assert.match(imageSource, /'image\/jpeg'/);
  assert.match(page, /type="file" accept="image\/\*"/);
  assert.match(page, /method: 'PUT'.*'Content-Type': 'image\/jpeg'/s);
  assert.match(page, /只有你和工作人员可以查看/);
  // The authenticated guest may preview their own short-lived signed URL in
  // memory, but the full DTO must never be persisted for an offline reload.
  assert.doesNotMatch(page, /sessionStorage\.setItem|GUEST_CACHE_KEY/);
  assert.match(page, /never restores? .*previous rehearsal|为避免显示上一轮的任务或线索/s);
});

test('private evidence stays outside public and offline data boundaries', async () => {
  const [publicSource, serviceWorker, guestData, stationData, adminData] = await Promise.all([
    readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
  ]);
  assert.equal(publicSource.includes('evidence_'), false);
  assert.equal(serviceWorker.includes('task-evidence'), false);
  assert.match(guestData, /signEvidencePaths\(visibleAssignments\)/);
  assert.match(stationData, /signEvidencePaths\(visibleAssignments\)/);
  assert.match(adminData, /submissions: await signEvidencePaths/);
});
