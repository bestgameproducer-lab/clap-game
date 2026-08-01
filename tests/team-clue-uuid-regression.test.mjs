import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608010005_fix_team_clue_uuid_regression.sql', import.meta.url);

test('latest explicit team-clue settlement never aggregates UUIDs with min', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /\(array_agg\(id order by id\)\)\[1\]/);
  assert.doesNotMatch(migration, /select min\(id\)/);
  assert.match(migration, /team_clues_settled_at=now\(\)/);
  assert.match(migration, /on conflict\(guest_id,clue_id\) do nothing/);
});
