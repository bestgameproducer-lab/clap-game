import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicData = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
const scoreboard = await readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8');

test('published results still reveal trickster identities without a trickster ranking', () => {
  assert.match(publicData, /select\('id,name,team,role,is_hidden_spy'\)/);
  assert.match(scoreboard, /THE FINAL REVEAL/);
  assert.match(scoreboard, /丘比特的恶作剧者/);
  assert.doesNotMatch(publicData, /buildPublicSpyReveals|spy_points_ledger/);
  assert.doesNotMatch(scoreboard, /SPY DOSSIER|恶作剧者行动档案|间谍分/);
});
