import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290023_private_task_evidence.sql', import.meta.url);

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
  assert.equal((route.match(/await requireGuest\(\)/g) ?? []).length, 3);
  assert.match(route, /requiredUuid\(body\.assignmentId, '任务 ID'\)/);
  assert.match(route, /requiredString\(body\.path, '照片路径', 250\)/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|supabaseServiceRoleKey/);
});

test('server issues only deterministic signed paths and short-lived read URLs', async () => {
  const source = await readFile(new URL('../lib/data/evidence.ts', import.meta.url), 'utf8');
  assert.match(source, /return `\$\{guestId\}\/\$\{assignmentId\}\/evidence\.jpg`/);
  assert.match(source, /\.eq\('guest_id', guestId\)/);
  assert.match(source, /\['assigned', 'rejected'\]\.includes\(data\.status\)/);
  assert.match(source, /createSignedUploadUrl\(path, \{ upsert: true \}\)/);
  assert.match(source, /EVIDENCE_URL_TTL_SECONDS = 10 \* 60/);
  assert.match(source, /createSignedUrls\(paths, EVIDENCE_URL_TTL_SECONDS\)/);
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
  assert.match(page, /assignments: nextData\.assignments\.map\(\(assignment: GuestData\['assignments'\]\[number\]\) => \(\{ \.\.\.assignment, evidence_url: null \}\)\)/);
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
  assert.match(stationData, /signEvidencePaths\(assignments\.data \?\? \[\]\)/);
  assert.match(adminData, /submissions: await signEvidencePaths/);
});
