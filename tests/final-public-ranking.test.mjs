import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [publicData, guestPage, scoreboardPage] = await Promise.all([
  readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8'),
]);

test('published results expose a complete public ranking even when the live scoreboard flag is off', () => {
  assert.match(publicData, /!game\.scoreboard_visible && !game\.results_visible/);
  assert.match(publicData, /leaderLimit: game\.results_visible \? scoreboardGuests\.length : 10/);
  assert.match(publicData, /findUndetectedTricksterIds/);
});

test('guest finale links to the complete ranking and explains the correct-vote point', () => {
  assert.match(guestPage, /投对恶作剧者获得 1 点个人积分/);
  assert.match(guestPage, /href="\/scoreboard">查看全员最终积分排名/);
});

test('final ranking explains undetected trickster priority without inventing a trickster score', () => {
  assert.match(scoreboardPage, /完美伪装/);
  assert.match(scoreboardPage, /其个人积分不额外增加/);
  assert.doesNotMatch(scoreboardPage, /恶作剧得分|间谍分/);
});
