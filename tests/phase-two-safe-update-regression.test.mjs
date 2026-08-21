import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202608010006_fix_phase_two_safe_update.sql', import.meta.url),
  'utf8',
);
const runtimeCleanupMigration = await readFile(
  new URL('../supabase/migrations/202608010009_fix_phase_two_runtime_cleanup_safe_update.sql', import.meta.url),
  'utf8',
);
const profilePowerMigration = await readFile(
  new URL('../supabase/migrations/202608210004_fix_phase_two_profile_power_safe_update.sql', import.meta.url),
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

test('phase-two transition cleanup uses explicit predicates accepted by production safe-update rules', () => {
  assert.match(
    runtimeCleanupMigration,
    /pg_get_functiondef\(\s*'public\.unlock_phase_two_missions\(text\)'::regprocedure/,
  );
  assert.match(runtimeCleanupMigration, /delete from phase_two_dilemmas where true;/);
  assert.match(runtimeCleanupMigration, /delete from phase_two_copy_choices where true;/);
  assert.match(runtimeCleanupMigration, /phase_two_runtime_cleanup_safe_update_patch_failed/);
  assert.match(runtimeCleanupMigration, /existing_runtime_preserved',true/);
  assert.doesNotMatch(runtimeCleanupMigration, /truncate|drop table/);
});

test('phase-two power alignment uses an explicit predicate accepted by production safe-update rules', () => {
  assert.match(
    profilePowerMigration,
    /pg_get_functiondef\(\s*'public\.unlock_phase_two_missions\(text\)'::regprocedure/,
  );
  assert.match(
    profilePowerMigration,
    /is_captain=\(primary_mission=''TEAM_CAPTAIN''\),updated_at=now\(\)\n\s*where true;/,
  );
  assert.match(profilePowerMigration, /phase_two_profile_power_safe_update_patch_failed/);
  assert.match(profilePowerMigration, /existing_runtime_preserved',true/);
  assert.match(profilePowerMigration, /guest_data_mutated',false/);
  assert.doesNotMatch(profilePowerMigration, /truncate|drop table|delete from phase_two_profiles/i);
});
