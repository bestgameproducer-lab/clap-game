import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607310029_limit_final_team_rewards.sql', import.meta.url), 'utf8');

test('final result settlement excludes the honor-only family group from team rewards', () => {
  assert.match(migration, /create or replace function settle_voting_results_with_lucky_v1/);
  assert.match(migration, /voter\.team in\('海岛组','沙漠组'\)/);
  assert.match(migration, /g\.team in\('海岛组','沙漠组'\)/);
  assert.doesNotMatch(migration, /team in\('海岛组','沙漠组','家人组'\)/);
  assert.match(migration, /existing_runtime_preserved/);
});

test('the corrected settlement keeps all existing idempotent reward boundaries', () => {
  assert.match(migration, /on conflict do nothing returning id into v_reward_id/g);
  assert.match(migration, /perform settle_phase_two_lucky\(p_actor\)/);
  assert.match(migration, /'results\.settle'/);
  assert.match(migration, /revoke all on function settle_voting_results_with_lucky_v1\(integer,text\)/);
});
