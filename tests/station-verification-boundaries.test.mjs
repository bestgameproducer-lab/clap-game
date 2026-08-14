import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('station DTO carries the server-authoritative verification type', async () => {
  const source = await read('lib/data/station.ts');

  assert.match(source, /verification_method,verification_type,points,category,stage,mission_code/);
  assert.match(source, /verification_method: task\.verification_method, verification_type: task\.verification_type/);
});

test('station UI cannot approve system missions or attach photos to non-photo missions', async () => {
  const source = await read('app/station/page.tsx');

  assert.match(source, /const stationCompletable = \['HOST_CONFIRM', 'STAFF_CONFIRM', 'PHOTO', 'MUTUAL_CONFIRM'\]\.includes/);
  assert.match(source, /const acceptsStaffPhoto = assignment\.task\?\.verification_type === 'PHOTO'/);
  assert.match(source, /actionOpen && acceptsStaffPhoto && \['assigned','submitted','rejected'\]\.includes/);
  assert.match(source, /stationCompletable && actionOpen && \['assigned','submitted','rejected'\]\.includes/);
  assert.match(source, /由宾客操作与系统自动结算，任务站无需处理/);
});

test('server and database fail closed outside the declared station verification contract', async () => {
  const [admin, evidence, migration] = await Promise.all([
    read('lib/data/admin.ts'),
    read('lib/data/evidence.ts'),
    read('supabase/migrations/202608140011_lock_station_verification_boundaries.sql'),
  ]);

  assert.match(admin, /station_manual_completion_forbidden/);
  assert.match(evidence, /tasks!assignments_task_id_fkey\(stage,category,verification_type\)/);
  assert.match(evidence, /task\?\.verification_type !== 'PHOTO'/);
  assert.match(evidence, /station_photo_evidence_forbidden/);
  assert.match(migration, /v_verification_type[\s\S]*not in\([\s\S]*'HOST_CONFIRM','STAFF_CONFIRM','PHOTO','MUTUAL_CONFIRM'/);
  assert.match(migration, /message='station_manual_completion_forbidden'/);
  assert.match(migration, /coalesce\(v_verification_type,''\)<>'PHOTO'/);
  assert.match(migration, /message='station_photo_evidence_forbidden'/);
  assert.match(migration, /assert_staff_assignment_evidence_change_open\(p_assignment_id,false\)/);
  assert.match(evidence, /removeStaffEvidence[\s\S]*requireEditableStaffAssignment\(assignmentId, false\)/);
  assert.match(migration, /revoke all on function complete_assignment_at_station\(uuid,text,text\)[\s\S]*from public,anon,authenticated,service_role/);
});
