import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL(
  '../supabase/migrations/202608130013_revoke_residual_assignment_clue_rewards.sql',
  import.meta.url,
), 'utf8');

test('residual cleanup recovers legacy clue provenance and removes propagated teammate copies', () => {
  assert.match(migration, /where a\.reward_clue_id is not null or a\.reward_task_id is not null/);
  assert.match(migration, /log\.action='assignment\.approve'/);
  assert.match(migration, /log\.details->>'guest_id'/);
  assert.match(migration, /log\.details->>'reward_clue_id'/);
  assert.match(migration, /legacy\.reward_clue_id is not null/);
  assert.match(migration, /gc\.clue_id=legacy\.reward_clue_id/);
  assert.doesNotMatch(migration, /gc\.guest_id=legacy\.guest_id/);
  assert.match(migration, /including propagated teammate copies/);
  assert.doesNotMatch(migration, /delete from clues|truncate|delete from guest_clues where true/i);
  assert.doesNotMatch(migration, /gc\.granted_by\s*=/i);
});

test('residual cleanup preserves a colliding clue that is part of the settled team grant', () => {
  assert.match(migration, /state\.team_clues_settled_at/);
  assert.match(migration, /state\.team_score_snapshot/);
  assert.match(migration, /current_team_clues/);
  assert.match(migration, /current_team_grants/);
  assert.match(migration, /and not exists\([\s\S]*?current_grant\.guest_id=gc\.guest_id[\s\S]*?current_grant\.clue_id=gc\.clue_id/);
  assert.match(migration, /team_collision_protection/);
});

test('residual cleanup selects the current trickster without unsupported UUID aggregates', () => {
  assert.match(migration, /\(array_agg\(guest\.id order by guest\.id\)\)\[1\] spy_id/);
  assert.match(migration, /count\(\*\)::integer spy_count/);
  assert.doesNotMatch(migration, /min\(guest\.id\)/);
});

test('residual cleanup preserves successful explicit staff clue grants', () => {
  assert.match(migration, /explicit_staff_grants/);
  assert.match(migration, /log\.action='clue\.grant'/);
  assert.match(migration, /staff_grant\.guest_id=gc\.guest_id/);
  assert.match(migration, /staff_grant\.clue_id=gc\.clue_id/);
  assert.match(migration, /staff_collision_protection/);
});

test('residual cleanup clears obsolete links and writes provenance to the audit log', () => {
  assert.match(migration, /update assignments a set reward_clue_id=null,reward_task_id=null/);
  assert.match(migration, /assignment\.residual_clue_rewards_revoked/);
  assert.match(migration, /source_assignment_id/);
  assert.match(migration, /team_and_staff_grants_preserved',true/);
  assert.match(migration, /clue_library_preserved',true/);
});
