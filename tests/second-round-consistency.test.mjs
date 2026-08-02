import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202608020001_fix_clue_and_final_score_consistency.sql', import.meta.url), 'utf8');
const guestPage = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');

test('settled team clues reach every drawn phase-two teammate, including story roles and tricksters', () => {
  assert.match(migration, /replace\([\s\S]+g\.eligible_for_secret_role[\s\S]+g\.id<>v_spy_id[\s\S]+and g\.team=v_team\.team/);
  assert.match(migration, /recipient\.phase_two_eligible/);
  assert.match(migration, /on conflict\(guest_id,clue_id\) do nothing/);
  assert.doesNotMatch(migration.slice(migration.indexOf('with settled_team_clues'), migration.indexOf('-- The trickster signal mission')), /eligible_for_secret_role|role<>'spy'|id<>v_spy_id/);
});

test('trickster signal mission survives act one cleanup without restoring trickster points', () => {
  assert.match(migration, /t\.mission_code<>''P1-TRICKSTER-001''/);
  assert.match(migration, /t\.mission_code='P1-TRICKSTER-001'[\s\S]+g\.role='spy'[\s\S]+a\.status='cancelled'/);
  assert.match(migration, /'trickster_bonus_points_restored',false/);
});

test('final voting no longer changes frozen team totals and prior bonuses are audibly corrected', () => {
  const settlement = migration.slice(migration.indexOf('create or replace function settle_voting_results_with_lucky_v1'));
  assert.match(settlement, /'guest_detective'/);
  assert.match(settlement, /perform settle_phase_two_lucky\(p_actor\)/);
  assert.doesNotMatch(settlement.slice(0, settlement.indexOf('-- Preserve the historical')), /insert into team_points_ledger|team_detective'|team_completion'/);
  assert.match(migration, /'终局隐含团队奖励冲正'/);
  assert.match(migration, /-sum\(rr\.amount\)/);
});

test('trickster call is rendered inside the real task and dilemma copy is reduced to its payoff table', () => {
  assert.match(guestPage, /function renderTricksterSignal\(assignment/);
  assert.match(guestPage, /assignment\.task\.mechanic !== 'TRICKSTER_SIGNAL'/);
  assert.match(guestPage, /renderPhaseTwoAction\(assignment\)\}\{renderTricksterSignal\(assignment\)/);
  assert.doesNotMatch(guestPage, /trickster-inline-command/);
  assert.match(guestPage, /isDilemmaTask[\s\S]+!isDilemmaTask && <p>\{assignment\.task\.description\}<\/p>/);
  assert.match(guestPage, /积分规则 · 必须秘密选择，不能商量/);
});

test('menu uses crisp accessible text instead of enlarging the raster image', () => {
  assert.match(guestPage, /className="dinner-menu-card"/);
  assert.match(guestPage, /Minestrone soup with basil pistou/);
  assert.match(guestPage, /Grilled Stockyard beef sirloin/);
  assert.doesNotMatch(guestPage, /<img src="\/wedding-dinner-menu\.jpg"/);
});
