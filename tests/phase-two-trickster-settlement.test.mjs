import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/202607310018_settle_phase_two_trickster_assignment.sql', import.meta.url);

test('final reveal completes only the phase-two trickster assignments', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /v_result:=settle_spy_results_before_phase_two_assignment_v1\(p_voting_round,p_actor\)/);
  assert.match(migration, /t\.mission_code='P2-TRICKSTER-001'/);
  assert.match(migration, /p\.primary_mission='TRICKSTER'/);
  assert.match(migration, /a\.status<>'approved'/);
  assert.match(migration, /status='approved'/);
  assert.doesNotMatch(migration, /delete from|truncate/i);
});

test('trickster completion is audited and the legacy function is not callable', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /'phase_two\.trickster_assignments_complete'/);
  assert.match(migration, /if v_completed>0 then/);
  assert.match(migration, /revoke all on function settle_spy_results_before_phase_two_assignment_v1\(integer,text\)[\s\S]+service_role/);
  assert.match(migration, /grant execute on function settle_spy_results\(integer,text\) to service_role/);
});
