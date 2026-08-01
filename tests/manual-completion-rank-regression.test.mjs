import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608010004_fix_manual_completion_rank.sql', import.meta.url);

test('system-completed initial tasks do not consume visible completion ranks', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /where is_initial and completion_rank is not null;/);
  assert.doesNotMatch(migration, /where is_initial and status='approved'/);
  assert.match(migration, /row_number\(\) over\(order by approved_at nulls last,created_at,id\)/);
});
