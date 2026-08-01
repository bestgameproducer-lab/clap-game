import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202608010006_fix_phase_two_safe_update.sql', import.meta.url),
  'utf8',
);

test('phase-two allocation uses explicit predicates accepted by production safe-update rules', () => {
  assert.match(
    migration,
    /pg_get_functiondef\(\s*'public\.unlock_phase_two_missions_assignments_v1\(text\)'::regprocedure/,
  );
  assert.match(migration, /delete from phase_two_profiles where true;/);
  assert.match(
    migration,
    /update phase_two_profiles set unlocked_at=now\(\),updated_at=now\(\) where true;/,
  );
  assert.match(migration, /phase_two_safe_update_patch_failed/);
  assert.match(migration, /existing_runtime_preserved',true/);
  assert.doesNotMatch(migration, /truncate|drop table/);
});
