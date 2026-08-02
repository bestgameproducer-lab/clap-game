import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202608020002_double_correct_vote_reward.sql', import.meta.url),
  'utf8',
);

test('correct final votes award exactly two personal points once', () => {
  const settlement = migration.slice(
    migration.indexOf('create or replace function settle_voting_results_with_lucky_v1'),
    migration.indexOf('revoke all on function settle_voting_results_with_lucky_v1'),
  );
  assert.match(settlement, /values\(p_voting_round,'guest_detective',v_vote\.voter_guest_id,2,/);
  assert.match(settlement, /update guests set points=points\+2/);
  assert.match(settlement, /values\(v_vote\.voter_guest_id,2,'终局投票正确找出恶作剧者'/);
  assert.match(settlement, /on conflict do nothing returning id into v_reward_id/);
});

test('double vote reward keeps team totals frozen and existing rewards untouched', () => {
  assert.match(migration, /perform settle_phase_two_lucky\(p_actor\)/);
  assert.match(migration, /'team_scores_frozen',true/);
  assert.match(migration, /'existing_rewards_preserved',true/);
  assert.doesNotMatch(migration, /delete from result_rewards|update result_rewards|team_points_ledger/i);
});
