import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublicScoreboard, findUndetectedTricksterIds } from '../lib/scoreboard-core.ts';

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

test('counts an exclusive extra-vote card as two votes after reveal', () => {
  const result = buildPublicScoreboard(guests, [], [
    { target_guest_id: 'c', vote_weight: 2 },
    { target_guest_id: 'a', vote_weight: 1 },
  ]);
  assert.deepEqual(result.voteCounts.map((item) => [item.name, item.votes]), [['C', 2], ['A', 1]]);
});

test('honor guests can rank personally without creating a placeholder team', () => {
  const result = buildPublicScoreboard([
    { id: 'family', name: 'Family', team: '荣誉宾客', points: 8, countsForTeam: false },
    { id: 'player', name: 'Player', team: '玫瑰组', points: 2 },
  ], [], []);

  assert.equal(result.leaders[0].name, 'Family');
  assert.equal(result.leaders[0].team, '荣誉宾客');
  assert.equal(result.teams.some((team) => team.team === '荣誉宾客'), false);
  assert.deepEqual(result.teams[0], { team: '玫瑰组', points: 0, guests: 1, completedTasks: 0 });
});

test('puts an undetected trickster first without changing personal points', () => {
  const finalGuests = [
    { id: 'spy', name: 'Hidden', team: '玫瑰组', points: 1 },
    { id: 'top', name: 'Suspect', team: '玫瑰组', points: 12 },
    { id: 'winner', name: 'Winner', team: '琥珀组', points: 20 },
  ];
  const finalVotes = [
    { target_guest_id: 'spy', vote_weight: 1 },
    { target_guest_id: 'top', vote_weight: 2 },
  ];
  const undetected = findUndetectedTricksterIds(finalGuests, finalVotes, [{ id: 'spy', team: '玫瑰组' }]);
  const result = buildPublicScoreboard(finalGuests, [], finalVotes, [], {
    leaderLimit: finalGuests.length,
    priorityGuestIds: undetected,
  });

  assert.deepEqual([...undetected], ['spy']);
  assert.equal(result.leaders[0].id, 'spy');
  assert.equal(result.leaders[0].points, 1);
  assert.equal(result.leaders[0].undetectedTrickster, true);
  assert.equal(result.leaders[1].id, 'winner');
});

test('a trickster tied for the team highest vote count is considered detected', () => {
  const finalGuests = [
    { id: 'spy', name: 'Hidden', team: '玫瑰组', points: 1 },
    { id: 'other', name: 'Other', team: '玫瑰组', points: 2 },
  ];
  const finalVotes = [
    { target_guest_id: 'spy', vote_weight: 2 },
    { target_guest_id: 'other', vote_weight: 2 },
  ];

  assert.equal(findUndetectedTricksterIds(finalGuests, finalVotes, [{ id: 'spy', team: '玫瑰组' }]).size, 0);
});
