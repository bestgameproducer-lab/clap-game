import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290021_task_verification_methods.sql', import.meta.url);

test('verification guidance is required and stored by the task RPC', async () => {
  const [migration, route, data] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /add column if not exists verification_method text not null/);
  assert.match(migration, /length\(trim\(verification_method\)\) between 1 and 500/);
  assert.match(migration, /p_verification_method text/);
  assert.match(migration, /verification_method=trim\(p_verification_method\)/);
  assert.match(migration, /'verification_method',trim\(p_verification_method\)/);
  assert.match(route, /requiredString\(body\.verificationMethod, '验证方式', 500\)/);
  assert.match(data, /p_verification_method: input\.verificationMethod/);
});

test('verification wording remains editable after a task is assigned', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const lockStart = migration.indexOf('if exists(select 1 from assignments');
  const updateStart = migration.indexOf('update tasks set');
  const lock = migration.slice(lockStart, updateStart);
  assert.ok(lockStart > 0 && updateStart > lockStart);
  for (const protectedField of ['points', 'role_scope', 'category', 'stage', 'grants_hidden_spy']) {
    assert.match(lock, new RegExp(protectedField));
  }
  assert.doesNotMatch(lock, /verification_method/);
});

test('guest, station, admin, and CSV views share the same proof requirement', async () => {
  const [adminPage, guestPage, stationPage, guestData, stationData, exportData] = await Promise.all([
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/export.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(adminPage, /id="task-verification"/);
  assert.match(adminPage, /verificationMethod: libraryTask\.verification_method/);
  assert.match(guestPage, /如何验证/);
  assert.match(stationPage, /核验要求/);
  assert.match(guestData, /task:tasks!assignments_task_id_fkey\(title,description,verification_method,points/);
  assert.match(stationData, /task:tasks!assignments_task_id_fkey\(id,title,description,verification_method,verification_type,points/);
  assert.match(exportData, /'验证方式'/);
  assert.match(exportData, /task\?\.verification_method/);
});

test('card draw RPC returns the verification method without changing draw invariants', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const draw = migration.slice(migration.indexOf('create function draw_guest_card'));
  assert.match(draw, /task_verification_method text/);
  assert.match(draw, /pg_advisory_xact_lock\(hashtext\('wedding-secret-card-draw-v1'\)\)/);
  assert.match(draw, /v_task\.verification_method,v_task\.points/);
  assert.match(draw, /values\(v_guest\.id,v_task\.id,true\)/);
});
