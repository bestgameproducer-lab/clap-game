import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { OFFICIAL_TASK_MANIFEST } from '../lib/official-task-manifest.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const TEAMS = ['海岛组', '沙漠组'];

function shuffled(values, seed) {
  const result = [...values];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function buildFirstAct(seed) {
  const fixed = [
    ['yifan', '沙漠组', 'P1-CER-001'],
    ['xingcheng', '家人组', 'P1-CER-002'],
    ['andao', '家人组', 'P1-CER-002'],
    ['feifei', '海岛组', 'P1-BONUS-001'],
    ['luyi', '海岛组', 'P1-BONUS-001'],
    ['yirui', '海岛组', 'P1-SOCIAL-001'],
    ['ziyang', '家人组', 'P1-SOCIAL-002'],
  ].map(([id, team, mission]) => ({ id, team, mission, spy: false }));

  const spies = [
    { id: 'huijie', team: '海岛组', mission: 'P1-SOCIAL-001', spy: true },
    { id: 'fangzhou', team: '沙漠组', mission: 'P1-SOCIAL-002', spy: true },
  ];
  const ordinaryPool = shuffled([
    ...Array.from({ length: 6 }, (_, index) => ({ id: `island-flex-${index}`, team: '海岛组' })),
    ...Array.from({ length: 8 }, (_, index) => ({ id: `desert-flex-${index}`, team: '沙漠组' })),
  ], seed);
  const ordinaryAssignments = [];
  const capacity = new Map([
    ['P1-BOUQUET-001', 2],
    ['P1-HEART-001', 5],
    ['P1-STAR-001', 5],
  ]);
  for (let index = 0; index < ordinaryPool.length; index += 1) {
    const player = ordinaryPool[index];
    const teamPhoto = player.team === '海岛组' ? 'P1-SOCIAL-001' : 'P1-SOCIAL-002';
    const hasTeamPhoto = ordinaryAssignments.some((assignment) => (
      assignment.team === player.team && assignment.mission === teamPhoto
    ));
    const remainingOnTeam = ordinaryPool.slice(index)
      .filter((candidate) => candidate.team === player.team).length;
    const candidates = [];
    if (!hasTeamPhoto) candidates.push(teamPhoto);
    if (hasTeamPhoto || remainingOnTeam > 1) {
      for (const [mission, limit] of capacity) {
        if (ordinaryAssignments.filter((assignment) => assignment.mission === mission).length < limit) {
          candidates.push(mission);
        }
      }
    }
    const [mission] = shuffled(candidates, (seed ^ 0x85ebca6b) + index);
    assert.ok(mission, `seed ${seed}: no task for ${player.id}`);
    ordinaryAssignments.push({ ...player, mission, spy: false });
  }

  return [...fixed, ...spies, ...ordinaryAssignments];
}

function allocateSecondAct(firstAct, seed) {
  const competitive = firstAct.filter((player) => TEAMS.includes(player.team));
  const selectedIds = new Set();
  const selected = [];
  const take = (player, mission) => {
    assert.ok(player, `missing candidate for ${mission}`);
    assert.equal(selectedIds.has(player.id), false, `${player.id} received two second-act slots`);
    selectedIds.add(player.id);
    selected.push({ ...player, mission });
  };

  for (const player of competitive.filter((candidate) => candidate.spy)) take(player, 'P2-TRICKSTER-001');
  take(competitive.find((player) => player.id === 'yirui'), 'P2-CEREMONY-001');

  const hearts = shuffled(competitive.filter((player) => player.mission === 'P1-HEART-001'), seed ^ 11);
  const stars = shuffled(competitive.filter((player) => player.mission === 'P1-STAR-001'), seed ^ 17);
  hearts.slice(0, 4).forEach((player) => take(player, 'P2-HEART-001'));
  take(hearts[4], 'P2-LONELY-001');
  stars.slice(0, 4).forEach((player) => take(player, 'P2-STAR-001'));
  take(stars[4], 'P2-GUIDE-001');

  for (const login of ['feifei', 'luyi']) {
    take(competitive.find((player) => player.id === login), 'P2-LUCKY-001');
  }

  let remaining = shuffled(
    competitive.filter((player) => !selectedIds.has(player.id)).map((player) => ({
      ...player,
      hadScoredFirstActPhoto: player.mission.startsWith('P1-SOCIAL-'),
    })),
    seed ^ 23,
  );
  for (const team of TEAMS) {
    const teamPool = remaining.filter((player) => player.team === team);
    const winner = teamPool.find((player) => player.hadScoredFirstActPhoto) ?? teamPool[0];
    take(winner, 'P2-POWER-001');
    remaining = remaining.filter((player) => player.id !== winner.id);
  }
  const dinnerCodes = ['P2-SOCIAL-001', 'P2-SOCIAL-002', 'P2-SOCIAL-003', 'P2-SOCIAL-004'];
  const shuffledDinnerCodes = shuffled(dinnerCodes, seed ^ 29);
  remaining.forEach((player, index) => take(player, shuffledDinnerCodes[index]));
  return selected;
}

test('official assignment-mode metadata describes the real allocator source', () => {
  const expected = new Map([
    ['P1-CER-001', 'FIXED'], ['P1-CER-002', 'FIXED'],
    ['P1-BOUQUET-001', 'CONTROLLED_RANDOM'],
    ['P1-HEART-001', 'CONTROLLED_RANDOM'], ['P1-STAR-001', 'CONTROLLED_RANDOM'],
    ['P1-SOCIAL-001', 'CONTROLLED_RANDOM'], ['P1-SOCIAL-002', 'CONTROLLED_RANDOM'],
    ['P1-BONUS-001', 'FIXED'], ['P1-TRICKSTER-001', 'ROLE_FIXED'],
    ['P2-SOCIAL-001', 'CONTROLLED_RANDOM'], ['P2-SOCIAL-002', 'CONTROLLED_RANDOM'],
    ['P2-SOCIAL-003', 'CONTROLLED_RANDOM'], ['P2-SOCIAL-004', 'CONTROLLED_RANDOM'],
    ['P2-CEREMONY-001', 'FIXED'],
    ['P2-HEART-001', 'RELATIONSHIP'], ['P2-STAR-001', 'RELATIONSHIP'],
    ['P2-LONELY-001', 'RELATIONSHIP'], ['P2-GUIDE-001', 'RELATIONSHIP'],
    ['P2-TRICKSTER-001', 'ROLE_FIXED'],
    ['P2-POWER-001', 'CONTROLLED_RANDOM'], ['P2-LUCKY-001', 'FIXED'],
  ]);
  assert.equal(expected.size, 21);
  assert.deepEqual(
    new Map(OFFICIAL_TASK_MANIFEST.map((task) => [task.mission_code, task.assignment_mode])),
    expected,
  );
});

test('historical assignment-mode migration aligned the former 23-row catalog', async () => {
  const migration = await read('supabase/migrations/202608140009_align_official_assignment_mode_metadata.sql');
  assert.match(migration, /get diagnostics v_count=row_count;[\s\S]*v_count<>23/);
  assert.match(migration, /pg_get_functiondef\('public\.formal_wedding_catalog_ready\(\)'::regprocedure\)/);
  assert.match(migration, /formal_catalog_assignment_mode_patch_failed/);
  assert.match(migration, /if not formal_wedding_catalog_ready\(\)/);
  assert.match(migration, /assignment_rows_changed',false/);
  assert.match(migration, /scores_changed',false/);
  assert.doesNotMatch(migration, /update\s+assignments|update\s+guests|insert\s+into\s+points_ledger/i);
});

test('1000 deterministic final-roster draw orders preserve P1 capacity and P2 no-repeat-photo invariants', () => {
  const expectedFirstAct = new Map([
    ['P1-CER-001', 1], ['P1-CER-002', 2], ['P1-BOUQUET-001', 2],
    ['P1-HEART-001', 5], ['P1-STAR-001', 5],
    ['P1-SOCIAL-001', 3], ['P1-SOCIAL-002', 3],
    ['P1-BONUS-001', 2],
  ]);
  const expectedSecondAct = new Map([
    ['P2-CEREMONY-001', 1], ['P2-HEART-001', 4], ['P2-STAR-001', 4],
    ['P2-LONELY-001', 1], ['P2-GUIDE-001', 1], ['P2-TRICKSTER-001', 2],
    ['P2-POWER-001', 2], ['P2-LUCKY-001', 2],
  ]);

  for (let seed = 1; seed <= 1000; seed += 1) {
    const firstAct = buildFirstAct(seed);
    assert.equal(firstAct.length, 23, `seed ${seed}: first-act account count`);
    assert.equal(new Set(firstAct.map((player) => player.id)).size, 23, `seed ${seed}: duplicate first-act account`);
    for (const [mission, count] of expectedFirstAct) {
      assert.equal(firstAct.filter((player) => player.mission === mission).length, count, `seed ${seed}: ${mission}`);
    }
    assert.deepEqual(
      firstAct.filter((player) => player.spy).map((player) => player.team).sort(),
      [...TEAMS].sort(),
      `seed ${seed}: one trickster per team`,
    );
    assert.deepEqual(
      TEAMS.map((team) => firstAct.filter((player) => player.team === team
        && player.id.includes('-flex-') && player.mission.startsWith('P1-SOCIAL-')).length),
      [1, 1],
      `seed ${seed}: one ordinary photo per team preserves both exclusive power slots`,
    );

    const secondAct = allocateSecondAct(firstAct, seed);
    assert.equal(secondAct.length, 20, `seed ${seed}: second-act account count`);
    assert.equal(new Set(secondAct.map((player) => player.id)).size, 20, `seed ${seed}: duplicate second-act account`);
    for (const [mission, count] of expectedSecondAct) {
      assert.equal(secondAct.filter((player) => player.mission === mission).length, count, `seed ${seed}: ${mission}`);
    }
    assert.equal(
      secondAct.filter((player) => player.mission.startsWith('P2-SOCIAL-')).length,
      3,
      `seed ${seed}: exactly three banquet social cards`,
    );
    assert.deepEqual(
      secondAct.filter((player) => player.mission === 'P2-POWER-001').map((player) => player.team).sort(),
      [...TEAMS].sort(),
      `seed ${seed}: one extra vote per team`,
    );
    assert.deepEqual(
      secondAct.filter((player) => player.mission === 'P2-LUCKY-001').map((player) => player.id).sort(),
      ['feifei', 'luyi'],
      `seed ${seed}: both fixed lucky stars receive the same primary ability`,
    );
    assert.equal(
      secondAct.filter((player) => player.mission.startsWith('P2-SOCIAL-'))
        .some((player) => player.hadScoredFirstActPhoto),
      false,
      `seed ${seed}: repeat photo recipient`,
    );
  }
});

test('final roster preserves global bouquet randomness while reserving one ordinary photo per team', async () => {
  const migration = await read('supabase/migrations/202608210003_preserve_global_bouquet_randomness.sql');
  assert.match(migration, /phase_two_eligible and t\.mission_code='P1-BOUQUET-001'/);
  assert.match(migration, /'competitive_team_restriction',false/);
  assert.match(migration, /P1-SOCIAL-001' and v_guest\.team='海岛组'/);
  assert.match(migration, /P1-SOCIAL-002' and v_guest\.team='沙漠组'/);
  assert.match(migration, /reserved_guest\.drawn_at is null/);
  assert.match(migration, /reserved_guest\.eligible_for_secret_role/);
  assert.match(migration, /runtime_rows_changed',false/);
});
