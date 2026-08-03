import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290015_final_voting_settlement.sql', import.meta.url);

test('each guest receives one immutable vote per voting round', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /voting_round integer not null default 0/);
  assert.match(migration, /unique index[\s\S]+votes_one_per_guest_round_idx[\s\S]+\(voter_guest_id, voting_round\)/);
  assert.match(migration, /message='vote_already_cast'/);
  assert.doesNotMatch(migration.slice(migration.lastIndexOf('create or replace function cast_team_vote')), /do update set target_guest_id/);
});

test('opening voting creates a fresh round without deleting history', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const stateFunction = migration.slice(migration.indexOf('create or replace function set_game_flag'), migration.indexOf('create or replace function cast_team_vote'));
  assert.match(stateFunction, /p_value and not v_state\.voting_open/);
  assert.match(stateFunction, /voting_round = voting_round \+ 1/);
  assert.doesNotMatch(stateFunction, /delete from votes|truncate/);
});

test('result publication settles personal and team rewards idempotently', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /'guest_detective'/);
  assert.match(migration, /'team_detective'/);
  assert.match(migration, /'team_completion'/);
  assert.match(migration, /on conflict \(voting_round,reward_type,guest_id\)[\s\S]+do nothing/);
  assert.match(migration, /on conflict \(voting_round,reward_type,team\)[\s\S]+do nothing/);
  assert.match(migration, /v_team\.completed_guests \* 4 > v_team\.total_guests \* 3 then 2/);
  assert.match(migration, /perform settle_voting_results\(v_state\.voting_round,p_actor\)/);
});

test('final rewards cannot repeat across replacement voting rounds', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607290016_global_final_reward_idempotency.sql', import.meta.url), 'utf8');
  assert.match(migration, /on result_rewards \(reward_type, guest_id\) where guest_id is not null/);
  assert.match(migration, /on result_rewards \(reward_type, team\) where team is not null/);
  assert.match(migration, /on conflict do nothing returning id into v_reward_id/);
});

test('current guest, admin, and public views are scoped to the active voting round', async () => {
  const [guestData, adminData, publicData, guestPage] = await Promise.all([
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(guestData, /eq\('voting_round', game\.voting_round\)/);
  assert.match(adminData, /vote\.voting_round === \(game\?\.voting_round \?\? 0\)/);
  assert.match(publicData, /eq\('voting_round', game\.voting_round\)/);
  assert.match(guestPage, /每人只有一次机会/);
  assert.match(guestPage, /Boolean\(data\.existingVote\)/);
});
