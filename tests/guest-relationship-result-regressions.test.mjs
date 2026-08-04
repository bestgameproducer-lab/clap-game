import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('relationship recipients can accept directly and errors stay beside the input', async () => {
  const [page, route, data, migration] = await Promise.all([
    read('app/guest/page.tsx'),
    read('app/api/accept-connection/route.ts'),
    read('lib/data/guest.ts'),
    read('supabase/migrations/202608030002_pair_acceptance_and_result_freeze.sql'),
  ]);
  assert.match(page, /无需再次输入编号/);
  assert.match(page, /查询玩家/);
  assert.match(page, /inline-feedback/);
  assert.match(page, /fetch\('\/api\/accept-connection'/);
  assert.match(route, /requireGuest\(\)/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requiredUuid/);
  assert.match(data, /rpc\('accept_player_connection'/);
  assert.match(migration, /create or replace function accept_player_connection/);
  assert.match(migration, /perform complete_system_mission/);
});

test('true trickster work never enters the ordinary facade and completed work unlocks a weighted ballot', async () => {
  const [page, migration] = await Promise.all([
    read('app/guest/page.tsx'),
    read('supabase/migrations/202608030004_unlock_trickster_vote_after_signal.sql'),
  ]);
  assert.match(page, /const facadeAssignments = isTricksterGuest \? data\.assignments\.filter\(\(assignment\) => assignment\.task\.category !== 'hidden'\)/);
  assert.match(page, /额外一票已解锁/);
  assert.match(migration, /t\.mission_code='P1-TRICKSTER-001'/);
  assert.match(migration, /then\s+v_weight:=2/);
});

test('guiding star has a first-act origin guard and team results use a frozen snapshot', async () => {
  const [page, guestData, publicData, migration] = await Promise.all([
    read('app/guest/page.tsx'),
    read('lib/data/guest.ts'),
    read('lib/data/public.ts'),
    read('supabase/migrations/202608030002_pair_acceptance_and_result_freeze.sql'),
  ]);
  assert.match(migration, /symbol='STAR' and s\.status='UNPAIRED_FINAL'/);
  assert.match(migration, /team_score_snapshot/);
  assert.match(page, /data\.phaseTwo\.originVerified/);
  assert.match(guestData, /game\.team_score_snapshot/);
  assert.match(publicData, /\.in\('team', \['海岛组', '沙漠组'\]\)/);
});

test('re-login activity acknowledgement stores category fingerprints, not task content', async () => {
  const page = await read('app/guest/page.tsx');
  assert.match(page, /wedding-guest-activity-ack-v2/);
  assert.match(page, /assignmentKey/);
  assert.match(page, /clueKey/);
  assert.match(page, /confirmationKey/);
  assert.match(page, /你离开期间有新的活动/);
});
