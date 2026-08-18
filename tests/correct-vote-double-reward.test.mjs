import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202608180001_family_random_and_capture_rewards.sql', import.meta.url),
  'utf8',
);

test('a captured trickster awards two points to correct voters and one to other submitted voters', () => {
  const settlement = migration.slice(
    migration.indexOf('create or replace function settle_voting_results_with_lucky_v1'),
    migration.indexOf('revoke all on function settle_voting_results_with_lucky_v1'),
  );
  assert.match(settlement, /v_team\.trickster_votes>0 and v_team\.trickster_votes=v_team\.top_votes/);
  assert.match(settlement, /v_amount:=case when v_vote\.is_correct then 2 else 1 end/);
  assert.match(settlement, /update guests set points=points\+v_amount/);
  assert.match(settlement, /终局投票成功追捕并投中恶作剧者/);
  assert.match(settlement, /终局投票成功追捕参与奖励/);
  assert.match(settlement, /on conflict do nothing returning id into v_reward_id/);
});

test('escaped teams and missing ballots receive no vote points while team totals stay frozen', () => {
  assert.match(migration, /perform settle_phase_two_lucky\(p_actor\)/);
  assert.match(migration, /'escaped_team_vote_points_each',0/);
  assert.match(migration, /'team_scores_frozen',true/);
  assert.match(migration, /where v\.voting_round=p_voting_round and voter\.team=v_team\.team/);
  assert.doesNotMatch(migration, /delete from result_rewards|update result_rewards|team_points_ledger/i);
});
