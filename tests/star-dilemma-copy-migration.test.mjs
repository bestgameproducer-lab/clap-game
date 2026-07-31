import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/202607310027_explain_star_dilemma_payoffs.sql', import.meta.url), 'utf8');

test('star dilemma task copy matches the established scoring transaction', () => {
  assert.match(migration, /双方同行各得 3 分/);
  assert.match(migration, /独占者得 5 分、同行者得 0 分/);
  assert.match(migration, /双方独占则各得 1 分/);
  assert.match(migration, /'scoring_logic_changed',false/);
  assert.doesNotMatch(migration, /create or replace function submit_phase_two_dilemma/);
});
