import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608020004_remove_placeholder_team_clues.sql', import.meta.url);

test('placeholder team clues are removed without deleting issued history', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  for (const title of ['完成不等于清白', '唯一恶作剧者', '队长身份不等于阵营', '本队唯一目标']) {
    assert.match(migration, new RegExp(title));
  }
  assert.match(migration, /update clues\s+set active = false/i);
  assert.match(migration, /delete from clues c/i);
  assert.match(migration, /not exists \(\s*select 1 from guest_clues/i);
  assert.match(migration, /not exists \(\s*select 1 from assignments/i);
  assert.doesNotMatch(migration, /truncate|delete from guest_clues|delete from assignments/i);
});
