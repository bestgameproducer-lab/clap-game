import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const castMigration = await readFile(new URL('../supabase/migrations/202608030004_unlock_trickster_vote_after_signal.sql', import.meta.url), 'utf8');
const syncMigration = castMigration;
const guestPage = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');

test('completed true trickster signal casts a real double-weight ballot after phase two opens', () => {
  const castVote = castMigration.slice(castMigration.indexOf('create or replace function cast_team_vote'));
  assert.match(castVote, /P1-TRICKSTER-001/);
  assert.match(castVote, /primary_mission='TRICKSTER'/);
  assert.match(castVote, /p\.unlocked_at is not null/);
  assert.match(castVote, /then\s+v_weight:=2/);
  assert.match(castVote, /insert into votes\(voter_guest_id,target_guest_id,voting_round,vote_weight\)/);
});

test('approval order cannot leave an existing trickster ballot at one vote', () => {
  assert.match(syncMigration, /assignment_trickster_vote_weight_sync/);
  assert.match(syncMigration, /after insert or update of status on assignments/);
  assert.match(syncMigration, /set vote_weight\s*=\s*2/);
  assert.match(syncMigration, /where voter_guest_id\s*=\s*new\.guest_id/);
  assert.match(syncMigration, /existing_ballots_backfilled/);
});

test('true trickster dashboard clearly distinguishes acquired and unlocked vote power', () => {
  assert.match(guestPage, /tricksterSignalAssignment[\s\S]+P1-TRICKSTER-001/);
  assert.match(guestPage, /tricksterSignalCompleted[\s\S]+status === 'approved'/);
  assert.match(guestPage, /tricksterExtraVoteUnlocked[\s\S]+data\.phaseTwo\?\.unlockedAt/);
  assert.match(guestPage, /真正任务完成 · 能力已获得/);
  assert.match(guestPage, /额外一票已解锁/);
  assert.match(guestPage, /系统会立即将你的选择按 2 票保存/);
});
