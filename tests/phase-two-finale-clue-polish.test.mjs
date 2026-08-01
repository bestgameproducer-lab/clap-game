import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = await read('supabase/migrations/202607310028_phase_two_finale_clue_polish.sql');
const guest = await read('app/guest/page.tsx');
const admin = await read('app/admin/page.tsx');

test('both act-two dilemmas are secret and show the complete payoff matrix', () => {
  assert.match(migration, /双方都选爱：各得 3 分[\s\S]*P2-HEART-001/);
  assert.match(migration, /双方都选同行：各得 3 分[\s\S]*P2-STAR-001/);
  assert.match(guest, /必须秘密选择 · 不能商量/);
  assert.match(guest, /你 0 分 · 伙伴 5 分/);
  assert.match(guest, /你 5 分 · 伙伴 0 分/);
});

test('captain identity is explicitly public to its holder', () => {
  assert.match(migration, /你可以主动告诉队友自己的队长身份/);
  assert.match(guest, /这是可以公开的身份/);
});

test('Cupid lucky star settles immediately and adds two for the initial lucky task', () => {
  assert.match(migration, /title='丘比特幸运星'/);
  assert.match(migration, /t\.mission_code='P1-BONUS-001'/);
  assert.match(migration, /case when v_initial_lucky then 2 else 0 end/);
  assert.match(migration, /status='approved'/);
  assert.match(migration, /perform settle_phase_two_lucky\(p_actor\)/);
});

test('activity acknowledgements persist only opaque fingerprints across page opens', () => {
  assert.match(guest, /ACTIVITY_ACK_KEY/);
  assert.match(guest, /activityFingerprint\(nextSnapshot\.guestId\)/);
  assert.match(guest, /saved\.signature !== activitySignature/);
  assert.match(guest, /你离开期间有新的活动/);
  assert.doesNotMatch(guest, /localStorage\.setItem\([^\n]*(assignmentIds|clueIds|phaseNote)/);
});

test('final reveal remains actionable during voting and uses an in-page confirmation', () => {
  assert.match(admin, /onClick=\{requestResultsToggle\}/);
  assert.match(admin, /自动关闭投票/);
  assert.doesNotMatch(admin.slice(admin.indexOf('function requestResultsToggle'), admin.indexOf('async function issueCode')), /window\.confirm/);
  assert.doesNotMatch(admin, /disabled=\{busy \|\| Boolean\(data\.game\?\.voting_open\)\}/);
});

test('clues are saved and displayed in organizer-defined groups', () => {
  assert.match(migration, /group_name text not null default '通用线索'/);
  assert.match(migration, /save_game_clue_v2/);
  assert.match(admin, /线索只需要分组、名称和内容/);
  assert.match(admin, /<optgroup/);
  assert.match(guest, /guestClueGroups/);
});

test('vote selection is separate from the right-aligned final confirmation', () => {
  assert.match(guest, /setSelectedVoteTargetId\(candidate\.id\)/);
  assert.match(guest, /className="vote-confirm-row"/);
  assert.match(guest, /确认投票/);
});
