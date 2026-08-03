import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicData = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
const scoreboard = await readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8');

test('published results reveal only tricksters, escape status, and ballot sources', () => {
  assert.match(publicData, /or\('role\.eq\.spy,is_hidden_spy\.eq\.true'\)/);
  assert.match(scoreboard, /THE FINAL REVEAL/);
  assert.match(scoreboard, /丘比特的恶作剧者/);
  assert.match(scoreboard, /恶作剧者揭晓/);
  assert.match(scoreboard, /成功逃脱 · 完美伪装/);
  assert.match(scoreboard, /guest\.voters\.map/);
  assert.doesNotMatch(scoreboard, /婚礼守护者/);
  assert.doesNotMatch(publicData, /buildPublicSpyReveals|spy_points_ledger/);
  assert.doesNotMatch(scoreboard, /SPY DOSSIER|恶作剧者行动档案|间谍分/);
});
