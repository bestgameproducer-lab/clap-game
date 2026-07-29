import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290018_guest_roster_management.sql', import.meta.url);

test('guest roster stores only operational wedding metadata', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  for (const field of ['table_label', 'is_elder', 'ceremony_eligible', 'active', 'staff_notes']) {
    assert.match(migration, new RegExp(`add column if not exists ${field}`));
  }
  assert.doesNotMatch(migration, /phone|email|address|birthday/);
  assert.match(migration, /length\(staff_notes\) <= 300/);
});

test('roster saves are validated, audited, and preserve claimed login identity', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const save = migration.slice(migration.indexOf('create or replace function save_guest_roster'), migration.indexOf('create or replace function registration_guest_list'));
  assert.match(save, /message='guest_login_conflict'/);
  assert.match(save, /v_guest\.claimed_at is not null/);
  assert.match(save, /message='guest_login_locked'/);
  assert.match(save, /message='drawn_guest_cannot_deactivate'/);
  assert.match(save, /update guest_sessions set revoked_at=now\(\)/);
  assert.match(save, /'guest\.roster_save'/);
});

test('inactive guests cannot appear in registration, station, or active sessions', async () => {
  const [migration, registration, station, auth] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../lib/data/registration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /from guests g where g\.active order by g\.name/);
  assert.match(migration, /where active and lower\(regexp_replace\(trim\(login_name\)/);
  assert.match(registration, /eq\('active', true\)/);
  assert.match(station, /eq\('active', true\)/);
  assert.match(auth, /eq\('id', data\.guest_id\)\.eq\('active', true\)/);
});

test('admin roster API validates every mutable field server-side', async () => {
  const [route, page, data] = await Promise.all([
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /type === 'saveGuestRoster'/);
  assert.match(route, /requiredString\(body\.name, '宾客姓名', 120\)/);
  assert.match(route, /requiredBoolean\(body\.isElder, '长辈标记'\)/);
  assert.match(route, /optionalString\(body\.staffNotes, '工作人员备注', 300\)/);
  assert.match(data, /rpc\('save_guest_roster'/);
  assert.match(page, /宾客名单管理/);
  assert.match(page, /例如 Fangzhou Chen/);
  assert.match(page, /停用会撤销该宾客所有登录会话/);
});

test('guest CSV includes roster operations fields without credential material', async () => {
  const source = await readFile(new URL('../lib/data/export.ts', import.meta.url), 'utf8');
  for (const field of ['table_label', 'is_elder', 'ceremony_eligible', 'active', 'staff_notes']) assert.match(source, new RegExp(field));
  for (const secret of ['claim_code_hash', 'token_hash', 'service_role']) assert.equal(source.includes(secret), false);
});
