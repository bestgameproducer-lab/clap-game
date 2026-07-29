import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicScoreboard } from '../lib/scoreboard-core.ts';

const guests = [
  { id: 'a', name: 'A', team: '玫瑰组', points: 20 },
  { id: 'b', name: 'B', team: '玫瑰组', points: 10 },
  { id: 'c', name: 'C', team: '琥珀组', points: 25 },
];

test('aggregates team points and approved tasks without role data', () => {
  const result = buildPublicScoreboard(guests, [
    { guest_id: 'a', status: 'approved' }, { guest_id: 'a', status: 'submitted' }, { guest_id: 'c', status: 'approved' },
  ], []);
  assert.deepEqual(result.teams[0], { team: '玫瑰组', points: 30, guests: 2, completedTasks: 1 });
  assert.equal('role' in result.leaders[0], false);
});

test('adds audited team-game points without changing personal rankings', () => {
  const result = buildPublicScoreboard(
    [{ id: 'a', name: 'A', team: '玫瑰组', points: 2 }], [], [],
    [{ team: '玫瑰组', amount: 5 }, { team: '月桂组', amount: 3 }],
  );
  assert.deepEqual(result.teams.map(({ team, points }) => ({ team, points })), [
    { team: '玫瑰组', points: 7 }, { team: '月桂组', points: 3 },
  ]);
  assert.equal(result.leaders[0].points, 2);
});

test('sorts individual leaders and vote counts deterministically', () => {
  const result = buildPublicScoreboard(guests, [], [{ target_guest_id: 'c' }, { target_guest_id: 'c' }, { target_guest_id: 'a' }]);
  assert.equal(result.leaders[0].name, 'C');
  assert.deepEqual(result.voteCounts.map((item) => [item.name, item.votes]), [['C', 2], ['A', 1]]);
});
