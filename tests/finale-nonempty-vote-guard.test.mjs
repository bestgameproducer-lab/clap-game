import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('irreversible result publication requires a ballot in the current round', async () => {
  const [migration, adminData, hostData, adminPage, hostPage] = await Promise.all([
    read('supabase/migrations/202608130026_require_a_ballot_before_final_reveal.sql'),
    read('lib/data/admin.ts'),
    read('lib/data/host.ts'),
    read('app/admin/page.tsx'),
    read('app/host/page.tsx'),
  ]);

  assert.match(migration, /before update of results_visible on game_state/);
  assert.match(migration, /v\.voting_round=new\.voting_round/);
  assert.match(migration, /message='no_votes_in_current_round'/);
  assert.match(adminData, /no_votes_in_current_round/);
  assert.match(hostData, /no_votes_in_current_round/);
  assert.match(adminPage, /data\.votes\.length === 0/);
  assert.match(adminPage, /等待本轮投票/);
  assert.match(hostPage, /data\.voteCount === 0/);
  assert.match(hostPage, /等待本轮投票/);
});
