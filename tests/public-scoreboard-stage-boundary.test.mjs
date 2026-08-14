import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('opening the public display cannot reveal scores before their wedding stage', async () => {
  const [data, page] = await Promise.all([
    read('lib/data/public.ts'),
    read('app/scoreboard/page.tsx'),
  ]);

  assert.match(data, /const teamScoresVisible = \['group_game', 'voting', 'results'\]\.includes\(game\.stage\)/);
  assert.match(data, /const individualScoresVisible = \['voting', 'results'\]\.includes\(game\.stage\)/);
  assert.match(data, /teams: teamScoresVisible \? scoreboard\.teams : \[\]/);
  assert.match(data, /leaders: individualScoresVisible \? scoreboard\.leaders : \[\]/);
  assert.match(page, /data\.teams\.length > 0/);
  assert.match(page, /data\.leaders\.length > 0/);
  assert.doesNotMatch(page, /积分尚未产生/);
});
