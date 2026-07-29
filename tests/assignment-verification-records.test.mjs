import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290022_assignment_verification_records.sql', import.meta.url);

test('assignment evidence fields are bounded and server-owned', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  for (const field of ['completion_note', 'verification_note', 'verified_by', 'verified_at']) {
    assert.match(migration, new RegExp(`add column if not exists ${field}`));
  }
  assert.match(migration, /length\(completion_note\) <= 500/);
  assert.match(migration, /length\(verification_note\) <= 500/);
  assert.match(migration, /revoke all on function submit_assignment\(uuid,uuid,text\) from public,anon,authenticated/);
  assert.match(migration, /revoke all on function approve_assignment_with_verification\(uuid,text,text\) from public,anon,authenticated/);
});

test('guest submission can only update its own assignable task', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const submit = migration.slice(migration.indexOf('create function submit_assignment'), migration.indexOf('create or replace function approve_assignment_with_verification'));
  assert.match(submit, /where id=p_assignment_id and guest_id=p_guest_id and status in \('assigned','rejected'\)/);
  assert.match(submit, /completion_note=trim\(coalesce\(p_completion_note,''\)\)/);
  assert.match(submit, /verification_note='',verified_by=null,verified_at=null/);
  assert.match(submit, /message='assignment_not_assignable'/);
});

test('approval records verification in the same database transaction', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const approval = migration.slice(migration.indexOf('create or replace function approve_assignment_with_verification'), migration.indexOf('create or replace function complete_assignment_at_station'));
  const approveCall = approval.indexOf('v_result:=approve_assignment');
  const verificationUpdate = approval.indexOf('verification_note=trim');
  assert.ok(approveCall > 0 && verificationUpdate > approveCall);
  assert.match(approval, /verified_by=p_actor,verified_at=now\(\)/);
  const station = migration.slice(migration.indexOf('create or replace function complete_assignment_at_station'));
  assert.match(station, /return approve_assignment_with_verification\(p_assignment_id,p_actor,trim\(p_reason\)\)/);
});

test('guest and staff APIs validate evidence text before database calls', async () => {
  const [guestRoute, adminRoute, guestData, adminData] = await Promise.all([
    readFile(new URL('../app/api/submit-task/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(guestRoute, /optionalString\(body\.completionNote, '完成说明', 500\)/);
  assert.match(guestData, /p_completion_note: completionNote/);
  assert.match(adminRoute, /requiredString\(body\.verificationNote, '核验记录', 500\)/);
  assert.match(adminData, /approve_assignment_with_verification/);
  assert.match(adminData, /p_verification_note: reason/);
});

test('evidence records appear in guest, staff, and assignment export views', async () => {
  const [guestPage, stationPage, adminPage, stationData, exportData] = await Promise.all([
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/export.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(guestPage, /完成说明（选填）/);
  assert.match(guestPage, /completionNote/);
  assert.match(guestPage, /任务站核验记录/);
  assert.match(stationPage, /宾客完成说明/);
  assert.match(stationPage, /verificationNote/);
  assert.match(adminPage, /请记录核验结果/);
  assert.match(stationData, /completion_note,verification_note,verified_at/);
  for (const header of ['宾客完成说明', '工作人员核验记录', '核验人员', '核验时间']) {
    assert.match(exportData, new RegExp(`'${header}'`));
  }
});
