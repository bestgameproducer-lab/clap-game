import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('database requires the current ballot to be closed and non-empty before final publication', async () => {
  const migration = await read('supabase/migrations/202608140003_require_closed_vote_before_final_reveal.sql');

  assert.match(migration, /new\.results_visible and not old\.results_visible/);
  assert.match(migration, /if old\.voting_open or new\.voting_open then[\s\S]*message='voting_still_open'/);
  assert.match(migration, /v\.voting_round=new\.voting_round/);
  assert.match(migration, /message='no_votes_in_current_round'/);
  assert.match(migration, /voting_must_be_closed_before_publish',true/);
  assert.match(migration, /revoke all on function guard_nonempty_current_vote_before_results\(\)/);
});

test('admin finale progress uses only drawn competitive voters and reports absences', async () => {
  const page = await read('app/admin/page.tsx');

  assert.match(page, /const competitiveDrawn = activeGuests\.filter\(\(guest\) => guest\.uses_app[\s\S]*guest\.phase_two_eligible[\s\S]*guest\.drawn_at\)\.length/);
  assert.match(page, /const missingFinalVotes = Math\.max\(competitiveDrawn - data\.votes\.length, 0\)/);
  assert.doesNotMatch(page, /data\.votes\.length\}\/\$\{drawn\}/);
  assert.match(page, /已投 \{data\.votes\.length\} 人 \/ 应投 \{competitiveDrawn\} 人 \/ 缺席 \{missingFinalVotes\} 人/);
  assert.match(page, /disabled=\{busy \|\| finalResultsLocked \|\| Boolean\(data\.game\?\.voting_open\)/);
  assert.match(page, /if \(data\?\.game\?\.voting_open\)[\s\S]*请先关闭本轮投票/);
});

test('host client and both staff data boundaries reject publishing while voting remains open', async () => {
  const [hostPage, adminData, hostData, adminRoute, hostRoute] = await Promise.all([
    read('app/host/page.tsx'),
    read('lib/data/admin.ts'),
    read('lib/data/host.ts'),
    read('app/api/admin-action/route.ts'),
    read('app/api/host-action/route.ts'),
  ]);

  assert.match(hostPage, /finaleAction === 'publish-results' && data\?\.game\?\.voting_open/);
  assert.match(hostPage, /pendingFinaleAction === 'publish-results' && Boolean\(data\.game\?\.voting_open\)/);
  for (const source of [adminData, hostData]) {
    assert.match(source, /field === 'results_visible' && value/);
    assert.match(source, /select\('voting_open'\)/);
    assert.match(source, /if \(state\?\.voting_open\) throw new ApiError\(409/);
    assert.match(source, /voting_still_open/);
  }
  assert.match(adminRoute, /setGameFlag\('results_visible', true, actor, currentRunId\(\)\)/);
  assert.match(hostRoute, /setHostFinaleFlag\('results_visible', true, actor, currentRunId\(\)\)/);
});
