import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290037_guest_roster_bulk_import.sql', import.meta.url);

test('bulk roster import is append-only, transactional, bounded, and audited', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /jsonb_array_length\(p_rows\) not between 1 and 100/);
  assert.match(migration, /select registration_open into v_registration_open from game_state where id=1 for update/);
  assert.match(migration, /message='guest_roster_import_registration_open'/);
  assert.match(migration, /insert into guests\(name,login_name,login_code,table_label,is_elder,ceremony_eligible,active,staff_notes\)/);
  assert.doesNotMatch(migration, /update guests set|delete from guests/);
  assert.match(migration, /exception when unique_violation/);
  assert.match(migration, /'guest\.roster_import'/);
  assert.match(migration, /revoke all on function import_guest_roster\(jsonb,text\) from public,anon,authenticated/);
});

test('bulk roster import is previewed and revalidated across client, route, and database', async () => {
  const [parser, validation, route, data, page] = await Promise.all([
    readFile(new URL('../lib/guest-roster-import.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/validation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(parser, /normalizeGuestLoginName/);
  assert.match(parser, /一次最多导入 100 位宾客/);
  assert.match(parser, /批量导入不会覆盖原宾客/);
  assert.match(validation, /requiredGuestRosterImportRows/);
  assert.match(route, /importGuestRoster\(requiredGuestRosterImportRows\(body\.rows\), actor\)/);
  assert.match(data, /rpc\('import_guest_roster'/);
  assert.match(page, /从表格或文本批量新增/);
  assert.match(page, /我已核对预览中的显示姓名和登录名/);
  assert.match(page, /data\.game\?\.registration_open/);
});
