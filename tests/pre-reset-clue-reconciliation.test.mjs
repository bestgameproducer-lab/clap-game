import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202608140010_reconcile_pre_reset_clue_library.sql', import.meta.url),
  'utf8',
);

test('the one-time clue reconciliation is bounded by the latest rehearsal reset', () => {
  assert.match(migration, /where action='rehearsal\.reset'/);
  assert.match(migration, /c\.created_at<=v_last_reset_at/);
  assert.match(migration, /where created_at<=v_last_reset_at/);
  assert.match(migration, /team_clues_settled_at is not null/);
  assert.match(migration, /settled_team_clues_preserved/);
  assert.match(migration, /post_reset_clues_preserved/);
  assert.match(migration, /pre_reset_clue_reconciliation_incomplete/);
  assert.doesNotMatch(migration, /truncate/i);
  assert.doesNotMatch(migration, /delete from (tasks|guests|assignments)/i);
});
