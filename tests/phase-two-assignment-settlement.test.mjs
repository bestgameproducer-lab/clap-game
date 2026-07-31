import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607310001_phase_two_assignments_and_powers.sql', import.meta.url), 'utf8');
const rules = await readFile(new URL('../lib/game-rules.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const guestData = await readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8');

test('phase two covers all twenty players with exclusive mission or power cards', () => {
  assert.match(migration, /'EXTRA_VOTE','SUPER_LUCKY'/);
  assert.match(migration, /\(select count\(\*\) from phase_two_profiles\)<>20/);
  assert.match(migration, /primary_mission='EXTRA_VOTE'\)<>2/);
  assert.match(migration, /primary_mission='SUPER_LUCKY'\)<>1/);
  assert.match(migration, /primary_mission='DINNER_SPEECH'\)<>1/);
  assert.match(migration, /lower\(login_name\)='yirui zhang'/);
  assert.match(migration, /mission_code='P1-TRICKSTER-001'/);
  assert.match(migration, /status='cancelled'/);
  assert.match(guestData, /neq\('status', 'cancelled'\)/);
  assert.match(migration, /phase_two_power_must_be_exclusive/);
  assert.doesNotMatch(adminPage, /checked=\{phaseTwoForm\.extraVote\}/);
  assert.match(rules, /'EXTRA_VOTE', 'SUPER_LUCKY'/);
});

test('phase two unlock is atomic, fail closed, and idempotent', () => {
  const unlock = migration.slice(migration.indexOf('create or replace function unlock_phase_two_missions'), migration.indexOf('create or replace function cast_team_vote'));
  assert.match(unlock, /pg_advisory_xact_lock/);
  assert.match(unlock, /phase_two_roster_not_ready/);
  assert.match(unlock, /phase_two_relationship_roles_not_ready/);
  assert.match(unlock, /phase_two_team_coverage_invalid/);
  assert.match(unlock, /if v_count>0 then return v_count/);
  assert.match(unlock, /on conflict\(guest_id,task_id\) do nothing/);
  assert.match(unlock, /'P2-POWER-001'/);
  assert.match(unlock, /'P2-LUCKY-001'/);
});

test('extra vote is stored once and consistently used by every final tally', () => {
  assert.match(migration, /add column if not exists vote_weight integer not null default 1/);
  assert.match(migration, /insert into votes\(voter_guest_id,target_guest_id,voting_round,vote_weight\)/);
  assert.match(migration, /sum\(v\.vote_weight\)::integer total_votes/);
  assert.match(migration, /sum\(v\.vote_weight\)::integer candidate_votes/);
  assert.match(migration, /weighted_ballots',true/);
});

test('super lucky snapshots phase-one points and settles once without rewriting history', () => {
  const settlement = migration.slice(migration.indexOf('create or replace function settle_phase_two_lucky'), migration.indexOf('-- Rebuild the latest voting settlement'));
  assert.match(migration, /phase_one_points_snapshot integer not null default 0/);
  assert.match(settlement, /lucky_bonus_settled_at is not null then return 0/);
  assert.match(settlement, /points=points\+v_profile\.phase_one_points_snapshot/);
  assert.match(settlement, /insert into points_ledger/);
  assert.match(settlement, /lucky_bonus_settled_at=now\(\)/);
  assert.doesNotMatch(settlement, /update points_ledger/);
  assert.match(migration, /perform settle_phase_two_lucky\(p_actor\)/);
});
