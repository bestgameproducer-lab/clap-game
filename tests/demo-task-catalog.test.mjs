import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290040_demo_task_catalog.sql', import.meta.url);

test('demo task catalogue provides one functional task for every drawn role', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /add column if not exists is_demo boolean not null default false/);
  assert.match(migration, /add column if not exists task_catalog_mode text not null default 'demo'/);
  assert.match(migration, /'\[演示\] 祝福交换'/);
  assert.match(migration, /'\[演示\] 小小误导'/);
  assert.match(migration, /'\[演示\] 线索提醒'/);
  for (const role of ['guest', 'spy', 'helper']) assert.match(migration, new RegExp(`,1,'${role}'`));
});

test('new card draws select only the current demo or live task catalogue', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /select registration_open,task_catalog_mode into v_registration_open,v_task_catalog_mode/);
  assert.equal((migration.match(/v_task_catalog_mode='demo' and is_demo/g) ?? []).length, 2);
  assert.equal((migration.match(/v_task_catalog_mode='live' and not is_demo/g) ?? []).length, 2);
  assert.match(migration, /Repeat requests return the original committed task even if the catalogue mode later changes/);
  assert.match(migration, /revoke all on function draw_guest_card\(uuid\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function draw_guest_card\(uuid\) to service_role/);
});
