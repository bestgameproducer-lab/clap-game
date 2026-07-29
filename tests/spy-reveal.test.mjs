import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPublicSpyReveals } from '../lib/spy-reveal-core.ts';

const spies = [
  { id: 'spy-a', name: 'Spy A', team: '玫瑰组', isHiddenSpy: false },
  { id: 'spy-b', name: 'Spy B', team: '月桂组', isHiddenSpy: true },
];

test('published spy dossiers summarize fixed actions without exposing staff notes', () => {
  const result = buildPublicSpyReveals(spies, [
    { guestId: 'spy-a', amount: 1, reason: 'team_wrong_answer' },
    { guestId: 'spy-a', amount: 1, reason: 'team_wrong_answer' },
    { guestId: 'spy-a', amount: 3, reason: 'escaped_vote' },
    { guestId: 'spy-b', amount: 2, reason: 'team_first' },
  ], []);

  assert.equal(result[0].id, 'spy-a');
  assert.equal(result[0].points, 5);
  assert.deepEqual(result[0].actions[0], {
    reason: 'team_wrong_answer', label: '影响队伍答错', count: 2, points: 2,
  });
  assert.equal(result[0].actions.some((action) => action.reason === 'escaped_vote'), true);
  assert.equal(JSON.stringify(result).includes('note'), false);
});

test('published spy dossiers include only spy and activation missions with completion status', () => {
  const result = buildPublicSpyReveals(spies, [], [
    { guestId: 'spy-a', title: '误导答案', status: 'approved', roleScope: 'spy', grantsHiddenSpy: false },
    { guestId: 'spy-a', title: '普通合影', status: 'approved', roleScope: 'all', grantsHiddenSpy: false },
    { guestId: 'spy-b', title: '隐藏觉醒', status: 'approved', roleScope: 'guest', grantsHiddenSpy: true },
    { guestId: 'spy-b', title: '保护身份', status: 'assigned', roleScope: 'spy', grantsHiddenSpy: false },
  ]);

  assert.deepEqual(result.find((spy) => spy.id === 'spy-a')?.missions, [
    { title: '误导答案', completed: true },
  ]);
  assert.deepEqual(result.find((spy) => spy.id === 'spy-b')?.missions, [
    { title: '隐藏觉醒', completed: true },
    { title: '保护身份', completed: false },
  ]);
});

test('public data loads dossier sources only after results and omits private notes', async () => {
  const source = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
  const pointQuery = source.indexOf("db.from('spy_points_ledger').select('guest_id,amount,reason')");
  const missionQuery = source.indexOf("db.from('assignments').select('guest_id,status,task:tasks(title,role_scope,grants_hidden_spy)')");
  const boundary = source.lastIndexOf('if (game.results_visible)', pointQuery);
  assert.ok(boundary >= 0 && boundary < pointQuery);
  assert.ok(missionQuery > boundary);
  assert.equal(source.includes("spy_points_ledger').select('guest_id,amount,reason,note"), false);
});

