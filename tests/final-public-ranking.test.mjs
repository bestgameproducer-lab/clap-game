import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [publicData, guestPage, scoreboardPage] = await Promise.all([
  readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8'),
]);

test('published results expose a complete ranking only while the public scoreboard is open', () => {
  assert.match(publicData, /if \(!game\.scoreboard_visible\)/);
  assert.doesNotMatch(publicData, /!game\.scoreboard_visible && !game\.results_visible/);
  assert.match(publicData, /leaderLimit: game\.results_visible \? scoreboardGuests\.length : 10/);
  assert.match(publicData, /findUndetectedTricksterIds/);
});

test('guest finale links to the complete ranking and explains every capture reward outcome', () => {
  assert.match(guestPage, /投中者 \+2 分，其他已投票者 \+1 分/);
  assert.match(guestPage, /若恶作剧者逃脱，本队所有人都不获得投票分/);
  assert.match(guestPage, /href="\/scoreboard">查看全员最终积分排名/);
});

test('final ranking explains undetected trickster priority without inventing a trickster score', () => {
  assert.match(scoreboardPage, /完美伪装/);
  assert.match(scoreboardPage, /其个人积分不额外增加/);
  assert.doesNotMatch(scoreboardPage, /恶作剧得分|间谍分/);
});
