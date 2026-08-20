import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('live mode retires every unfinished task outside the exact current official manifest', async () => {
  const [migration, currentRules, manifest] = await Promise.all([
    read('supabase/migrations/202608130025_retire_nonofficial_live_assignments.sql'),
    read('supabase/migrations/202608200002_bouquet_lucky_and_double_verdict.sql'),
    read('lib/official-task-manifest.ts'),
  ]);
  const expected = [...manifest.matchAll(/^\s*\['(P[12]-[A-Z0-9-]+)'/gm)].map((match) => match[1]).sort();
  const currentGuard = currentRules.slice(
    currentRules.indexOf('create or replace function is_official_wedding_mission_code'),
    currentRules.indexOf('revoke all on function is_official_wedding_mission_code'),
  );
  const guarded = [...currentGuard.matchAll(/'(P[12]-[A-Z0-9-]+)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(guarded)].sort(), expected);
  assert.equal(expected.length, 21);
  assert.match(migration, /'P1-FAMILY-001'/, 'historical 23-task guard remains auditable');
  assert.doesNotMatch(currentGuard, /P1-FAMILY-001/);
  assert.match(migration, /state\.task_catalog_mode='live'/);
  assert.match(migration, /a\.status in\('assigned','submitted','rejected'\)/);
  assert.match(migration, /not is_official_wedding_mission_code\(t\.mission_code\)/);
  assert.match(migration, /status='cancelled'/);
  assert.match(migration, /assignment\.nonofficial_live_retired/);
  assert.match(migration, /approved_history_preserved',true/);
});

test('database triggers reject null and obsolete non-null mission codes in live mode', async () => {
  const migration = await read('supabase/migrations/202608130025_retire_nonofficial_live_assignments.sql');
  const catalog = migration.slice(
    migration.indexOf('create or replace function guard_live_custom_task_catalog'),
    migration.indexOf('create or replace function guard_live_custom_task_assignment'),
  );
  const assignment = migration.slice(
    migration.indexOf('create or replace function guard_live_custom_task_assignment'),
    migration.indexOf('revoke all on function guard_live_custom_task_catalog'),
  );
  for (const body of [catalog, assignment]) {
    assert.match(body, /not is_official_wedding_mission_code/);
  }
  assert.doesNotMatch(catalog, /new\.mission_code is null/);
  assert.doesNotMatch(assignment, /t\.mission_code is null/);
});
