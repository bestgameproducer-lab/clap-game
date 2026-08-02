import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202608020003_fix_phase_two_team_power_distribution.sql', import.meta.url),
  'utf8',
);

test('double-vote cards are reserved once per competitive team', () => {
  assert.match(migration, /foreach v_team in array array\['海岛组','沙漠组'\] loop/);
  assert.match(migration, /g\.team=v_team/);
  assert.match(migration, /primary_mission='EXTRA_VOTE'\)<>1/);
  assert.match(migration, /phase_two_team_power_distribution_patch_failed/);
});

test('team reservation preserves photo-task exclusion preference and existing rounds', () => {
  assert.match(migration, /P1-SOCIAL-001','P1-SOCIAL-002/);
  assert.match(migration, /order by exists\(/);
  assert.match(migration, /existing_runtime_preserved',true/);
  assert.doesNotMatch(migration, /truncate|drop table|delete from assignments/);
});
