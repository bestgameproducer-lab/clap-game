import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608140006_correct_siran_display_name.sql', import.meta.url);

test('confirmed Chinese display name is corrected without changing the login identity', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /set name='李思冉 Siran Li'/);
  assert.match(migration, /login_name[\s\S]*='siran li'/);
  assert.doesNotMatch(migration, /set\s+login_name\s*=/i);
  assert.match(migration, /guest\.display_name_corrected/);
});
