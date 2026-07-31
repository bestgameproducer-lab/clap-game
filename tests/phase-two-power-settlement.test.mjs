import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/202607310019_settle_phase_two_power_assignments.sql', import.meta.url);

test('final reveal completes the exclusive phase-two power cards', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /v_result:=settle_voting_results_before_power_assignment_v1\(p_voting_round,p_actor\)/);
  assert.match(migration, /p\.primary_mission='EXTRA_VOTE' and t\.mission_code='P2-POWER-001'/);
  assert.match(migration, /p\.primary_mission='SUPER_LUCKY' and t\.mission_code='P2-LUCKY-001'/);
  assert.match(migration, /a\.status<>'approved'/);
  assert.match(migration, /status='approved'/);
  assert.doesNotMatch(migration, /delete from|truncate/i);
});

test('power-card completion is audited once and the legacy function is private', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /if v_completed>0 then/);
  assert.match(migration, /'phase_two\.power_assignments_complete'/);
  assert.match(migration, /revoke all on function settle_voting_results_before_power_assignment_v1\(integer,text\)[\s\S]+service_role/);
  assert.match(migration, /grant execute on function settle_voting_results\(integer,text\) to service_role/);
});
