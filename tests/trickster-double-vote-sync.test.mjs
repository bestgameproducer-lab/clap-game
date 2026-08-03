import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const castMigration = await readFile(new URL('../supabase/migrations/202608030002_pair_acceptance_and_result_freeze.sql', import.meta.url), 'utf8');
const syncMigration = await readFile(new URL('../supabase/migrations/202608030003_sync_trickster_double_vote.sql', import.meta.url), 'utf8');

test('completed trickster mission casts a real double-weight ballot', () => {
  const castVote = castMigration.slice(castMigration.indexOf('create or replace function cast_team_vote'));
  assert.match(castVote, /P2-TRICKSTER-001/);
  assert.match(castVote, /then v_weight:=2/);
  assert.match(castVote, /insert into votes\(voter_guest_id,target_guest_id,voting_round,vote_weight\)/);
});

test('approval order cannot leave an existing trickster ballot at one vote', () => {
  assert.match(syncMigration, /assignment_trickster_vote_weight_sync/);
  assert.match(syncMigration, /after insert or update of status on assignments/);
  assert.match(syncMigration, /set vote_weight = 2/);
  assert.match(syncMigration, /where voter_guest_id = new\.guest_id/);
  assert.match(syncMigration, /existing_ballots_backfilled/);
});
