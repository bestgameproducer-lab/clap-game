import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608120001_remove_assignment_clue_rewards.sql', import.meta.url);

test('mission approval never grants clues or upgrade assignments in any wedding stage', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const approval = migration.slice(migration.indexOf('create or replace function approve_assignment'));

  assert.doesNotMatch(approval, /insert into guest_clues/i);
  assert.doesNotMatch(approval, /insert into assignments\s*\(/i);
  assert.doesNotMatch(approval, /v_game_stage|game_state\.stage|task_round_1'\s*then/i);
  assert.match(approval, /'reward_policy','points_only'/);
  assert.match(approval, /'reward_clue_id',null/);
  assert.match(approval, /'reward_assignment_id',null/);
});

test('cleanup revokes only assignment-linked clue rewards', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const cleanup = migration.slice(0, migration.indexOf('create or replace function approve_assignment'));

  assert.match(cleanup, /delete from guest_clues gc\s+using assignments a/i);
  assert.match(cleanup, /a\.guest_id=gc\.guest_id\s+and a\.reward_clue_id=gc\.clue_id/i);
  assert.doesNotMatch(cleanup, /delete from guest_clues(?:\s+where true|;)/i);
  assert.match(cleanup, /team-settlement and explicit staff grants[\s\S]+preserved/i);
});

test('points, completion rank, hidden-spy activation and audit logging remain intact', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const approval = migration.slice(migration.indexOf('create or replace function approve_assignment'));

  assert.match(approval, /insert into points_ledger/);
  assert.match(approval, /update assignments set completion_rank=v_rank/);
  assert.match(approval, /hidden_spy_activated/);
  assert.match(approval, /insert into audit_log/);
  assert.match(approval, /grant execute on function approve_assignment\(uuid,text,text\) to service_role/);
});
