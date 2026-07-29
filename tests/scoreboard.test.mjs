import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicScoreboard } from '../lib/scoreboard-core.ts';

const guests = [
  { id: 'a', name: 'A', team: '玫瑰组', points: 20 },
  { id: 'b', name: 'B', team: '玫瑰组', points: 10 },
  { id: 'c', name: 'C', team: '琥珀组', points: 25 },
];

test('keeps personal points out of team scoring while aggregating approved tasks', () => {
  const result = buildPublicScoreboard(guests, [
    { guest_id: 'a', status: 'approved' }, { guest_id: 'a', status: 'submitted' }, { guest_id: 'c', status: 'approved' },
  ], []);
  assert.deepEqual(result.teams.find((team) => team.team === '玫瑰组'), { team: '玫瑰组', points: 0, guests: 2, completedTasks: 1 });
  assert.deepEqual(result.teams.find((team) => team.team === '琥珀组'), { team: '琥珀组', points: 0, guests: 1, completedTasks: 1 });
  assert.equal('role' in result.leaders[0], false);
});

test('adds audited team-game points without changing personal rankings', () => {
  const result = buildPublicScoreboard(
    [{ id: 'a', name: 'A', team: '玫瑰组', points: 2 }], [], [],
    [{ team: '玫瑰组', amount: 5 }, { team: '月桂组', amount: 3 }],
  );
  assert.deepEqual(result.teams.map(({ team, points }) => ({ team, points })), [
    { team: '玫瑰组', points: 5 }, { team: '月桂组', points: 3 },
  ]);
  assert.equal(result.leaders[0].points, 2);
});

test('team ranking cannot be changed by large personal task totals', () => {
  const result = buildPublicScoreboard(
    [
      { id: 'a', name: 'A', team: '玫瑰组', points: 500 },
      { id: 'b', name: 'B', team: '月桂组', points: 1 },
    ],
    [],
    [],
    [{ team: '月桂组', amount: 1 }],
  );
  assert.deepEqual(result.teams.map(({ team, points }) => ({ team, points })), [
    { team: '月桂组', points: 1 }, { team: '玫瑰组', points: 0 },
  ]);
  assert.equal(result.leaders[0].name, 'A');
});

test('sorts individual leaders and vote counts deterministically', () => {
  const result = buildPublicScoreboard(guests, [], [{ target_guest_id: 'c' }, { target_guest_id: 'c' }, { target_guest_id: 'a' }]);
  assert.equal(result.leaders[0].name, 'C');
  assert.deepEqual(result.voteCounts.map((item) => [item.name, item.votes]), [['C', 2], ['A', 1]]);
});
