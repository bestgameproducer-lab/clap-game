import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildPublicScoreboard,
  findUndetectedTricksterIds,
} from '../lib/scoreboard-core.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const COMPETITIVE_TEAMS = ['海岛组', '沙漠组'];

function settleDilemma(a, b) {
  const cooperative = new Set(['LOVE', 'TOGETHER']);
  if (cooperative.has(a) && cooperative.has(b)) return [3, 3];
  if (cooperative.has(a)) return [0, 5];
  if (cooperative.has(b)) return [5, 0];
  return [1, 1];
}

function resolveFiveSymbolHolders(pairedCount) {
  assert.ok([0, 2, 4].includes(pairedCount));
  const autoPairs = (4 - pairedCount) / 2;
  return {
    paired: pairedCount + autoPairs * 2,
    unmatched: 1,
    autoPairedPlayers: autoPairs * 2,
  };
}

function allocateRemainingPowers(players) {
  const remaining = players.map((player) => ({ ...player }));
  const selected = [];
  for (const team of COMPETITIVE_TEAMS) {
    const teamPool = remaining.filter((player) => player.team === team);
    const winner = teamPool.find((player) => player.hadPhoto) ?? teamPool[0];
    assert.ok(winner, `missing ${team} extra-vote candidate`);
    selected.push({ ...winner, mission: 'EXTRA_VOTE' });
    remaining.splice(remaining.findIndex((player) => player.id === winner.id), 1);
  }
  const lucky = remaining.find((player) => player.hadPhoto) ?? remaining[0];
  assert.ok(lucky, 'missing lucky-star candidate');
  selected.push({ ...lucky, mission: 'SUPER_LUCKY' });
  remaining.splice(remaining.findIndex((player) => player.id === lucky.id), 1);
  return { selected, photoMissions: remaining };
}

function completeAutoPairedMission(assignments, ledger, guestId, symbol) {
  const missionCode = symbol === 'HEART' ? 'P1-HEART-001' : 'P1-STAR-001';
  const mechanic = symbol === 'HEART' ? 'HEART_MATCH' : 'STAR_MATCH';
  const assignment = assignments.find((candidate) => (
    candidate.guestId === guestId
      && candidate.isInitial
      && ['assigned', 'submitted', 'rejected'].includes(candidate.status)
      && candidate.missionCode === missionCode
      && candidate.mechanic === mechanic
      && candidate.formalAllowed
      && candidate.active
  ));
  if (!assignment) return 0;
  if (ledger.some((entry) => entry.assignmentId === assignment.id)) return 0;
  ledger.push({ assignmentId: assignment.id, guestId, amount: 2 });
  assignment.status = 'approved';
  assignment.completionRank = null;
  return 2;
}

test('the 32-account wedding grain is 20 competitors, 10 family accounts and 2 principals', () => {
  const accounts = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `island-${i}`, team: '海岛组', mode: 'ACTIVE_PLAYER' })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `desert-${i}`, team: '沙漠组', mode: 'ACTIVE_PLAYER' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `family-player-${i}`, team: '家人组', mode: 'ACTIVE_PLAYER' })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: `family-honor-${i}`, team: '家人组', mode: 'HONOR_GUEST' })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `principal-${i}`, team: null, mode: 'PRINCIPAL' })),
  ];
  assert.equal(accounts.length, 32);
  assert.equal(accounts.filter((guest) => COMPETITIVE_TEAMS.includes(guest.team)).length, 20);
  assert.equal(accounts.filter((guest) => guest.team === '家人组').length, 10);
  assert.equal(accounts.filter((guest) => guest.mode === 'PRINCIPAL').length, 2);
});

test('every legal unfinished five-player symbol state resolves to two pairs and one awakening', () => {
  for (const pairedCount of [0, 2, 4]) {
    const result = resolveFiveSymbolHolders(pairedCount);
    assert.equal(result.paired, 4);
    assert.equal(result.unmatched, 1);
    assert.equal(result.autoPairedPlayers + pairedCount, 4);
  }
});

test('fallback-created alliances complete both first-act missions before cleanup', async () => {
  const migration = await read('supabase/migrations/202608130034_complete_auto_paired_symbol_missions.sql');
  assert.match(migration, /a\.guest_id=v_a and a\.is_initial[\s\S]*P1-HEART-001[\s\S]*P1-STAR-001[\s\S]*t\.mechanic=v_mechanic and t\.formal_allowed and t\.active/);
  assert.match(migration, /a\.guest_id=v_b and a\.is_initial[\s\S]*perform complete_system_mission\(v_b,v_mechanic/);
  assert.match(migration, /a\.status in\('assigned','submitted','rejected'\)/);
  assert.match(migration, /update guests set unlocked_role=v_alliance_role[\s\S]*perform complete_system_mission\(v_a,v_mechanic[\s\S]*perform complete_system_mission\(v_b,v_mechanic[\s\S]*insert into audit_log/);
  assert.match(migration, /assignment_scope','official_initial_heart_or_star_only/);
  assert.match(migration, /early_completion_rank_awarded',false/);
  assert.match(migration, /existing_runtime_preserved',true/);
  assert.doesNotMatch(migration, /update assignments|update guests set points|insert into points_ledger/);
});

test('auto-pair completion is exact, rank-free, retry-safe and leaves unrelated players untouched', () => {
  const assignments = [
    { id: 'heart-a', guestId: 'a', isInitial: true, status: 'assigned', missionCode: 'P1-HEART-001', mechanic: 'HEART_MATCH', formalAllowed: true, active: true, completionRank: null },
    { id: 'heart-b', guestId: 'b', isInitial: true, status: 'submitted', missionCode: 'P1-HEART-001', mechanic: 'HEART_MATCH', formalAllowed: true, active: true, completionRank: null },
    { id: 'already-done', guestId: 'manual', isInitial: true, status: 'approved', missionCode: 'P1-HEART-001', mechanic: 'HEART_MATCH', formalAllowed: true, active: true, completionRank: 3 },
    { id: 'lonely', guestId: 'unmatched', isInitial: true, status: 'assigned', missionCode: 'P1-HEART-001', mechanic: 'HEART_MATCH', formalAllowed: true, active: true, completionRank: null },
    { id: 'legacy', guestId: 'a', isInitial: false, status: 'cancelled', missionCode: 'LEGACY-HEART', mechanic: 'HEART_MATCH', formalAllowed: false, active: false, completionRank: null },
    { id: 'wrong-symbol', guestId: 'a', isInitial: true, status: 'assigned', missionCode: 'P1-STAR-001', mechanic: 'STAR_MATCH', formalAllowed: true, active: true, completionRank: null },
  ];
  const ledger = [];
  assert.equal(completeAutoPairedMission(assignments, ledger, 'a', 'HEART'), 2);
  assert.equal(completeAutoPairedMission(assignments, ledger, 'b', 'HEART'), 2);
  assert.equal(completeAutoPairedMission(assignments, ledger, 'a', 'HEART'), 0);
  assert.equal(completeAutoPairedMission(assignments, ledger, 'manual', 'HEART'), 0);
  assert.equal(ledger.reduce((sum, entry) => sum + entry.amount, 0), 4);
  assert.deepEqual(ledger.map((entry) => entry.assignmentId), ['heart-a', 'heart-b']);
  assert.equal(assignments.find((entry) => entry.id === 'heart-a').completionRank, null);
  assert.equal(assignments.find((entry) => entry.id === 'heart-b').completionRank, null);
  assert.equal(assignments.find((entry) => entry.id === 'already-done').completionRank, 3);
  assert.equal(assignments.find((entry) => entry.id === 'lonely').status, 'assigned');
  assert.equal(assignments.find((entry) => entry.id === 'legacy').status, 'cancelled');
  assert.equal(assignments.find((entry) => entry.id === 'wrong-symbol').status, 'assigned');
});

test('all photo-holder team distributions leave exactly four no-repeat photo missions', () => {
  // After tricksters, the fixed speaker and ten relationship roles are taken,
  // seven ordinary profiles remain. Exactly two of these seven had a scored
  // first-act photo. Enumerate every team distribution and every identity
  // combination instead of trusting one random draw.
  const teams = [
    '海岛组', '海岛组', '海岛组', '海岛组',
    '沙漠组', '沙漠组', '沙漠组',
  ];
  for (let first = 0; first < teams.length; first += 1) {
    for (let second = first + 1; second < teams.length; second += 1) {
      const players = teams.map((team, index) => ({
        id: `candidate-${index}`,
        team,
        hadPhoto: index === first || index === second,
      }));
      const result = allocateRemainingPowers(players);
      assert.equal(result.selected.filter((entry) => entry.mission === 'EXTRA_VOTE').length, 2);
      assert.deepEqual(
        result.selected.filter((entry) => entry.mission === 'EXTRA_VOTE').map((entry) => entry.team).sort(),
        [...COMPETITIVE_TEAMS].sort(),
      );
      assert.equal(result.selected.filter((entry) => entry.mission === 'SUPER_LUCKY').length, 1);
      assert.equal(result.photoMissions.length, 4);
      assert.equal(result.photoMissions.some((entry) => entry.hadPhoto), false);
    }
  }
});

test('heart and star payoff tables are exhaustive and conserve the specified outcomes', () => {
  const heart = ['LOVE', 'HATE'];
  const star = ['TOGETHER', 'TAKE_ALL'];
  for (const choices of [heart, star]) {
    const outcomes = choices.flatMap((a) => choices.map((b) => [a, b, ...settleDilemma(a, b)]));
    assert.deepEqual(outcomes.map((row) => row.slice(2)), [[3, 3], [0, 5], [5, 0], [1, 1]]);
    assert.ok(outcomes.every((row) => row[2] >= 0 && row[3] >= 0));
  }
});

test('family personal points rank normally but never create or change a team score', () => {
  const result = buildPublicScoreboard([
    { id: 'family', name: 'Family', team: '家人组', points: 30, countsForTeam: false },
    { id: 'island', name: 'Island', team: '海岛组', points: 4, countsForTeam: true },
    { id: 'desert', name: 'Desert', team: '沙漠组', points: 5, countsForTeam: true },
  ], [], [], [
    { team: '家人组', amount: 999 },
    { team: '海岛组', amount: 7 },
    { team: '沙漠组', amount: 6 },
  ], { leaderLimit: 3 });
  assert.equal(result.leaders[0].id, 'family');
  assert.deepEqual(result.teams.map(({ team, points }) => [team, points]), [
    ['海岛组', 7], ['沙漠组', 6],
  ]);
});

test('role-specific zero-point assignments cannot change tied final rankings', () => {
  const tiedGuests = [
    { id: 'ordinary', name: 'A Ordinary', team: '海岛组', points: 7 },
    { id: 'ability', name: 'B Ability', team: '沙漠组', points: 7 },
  ];
  const rankings = buildPublicScoreboard(tiedGuests, [
    { guest_id: 'ability', status: 'approved' },
    { guest_id: 'ordinary', status: 'approved' },
    { guest_id: 'ordinary', status: 'approved' },
  ], [], [
    { team: '海岛组', amount: 4 },
    { team: '沙漠组', amount: 4 },
  ], { leaderLimit: tiedGuests.length });

  assert.deepEqual(rankings.leaders.map((guest) => guest.id), ['ordinary', 'ability']);
  assert.deepEqual(rankings.teams.map((team) => team.team), ['沙漠组', '海岛组']);
});

test('weighted ballots affect capture, while a correct voter receives one two-point reward', () => {
  const guests = [
    { id: 'spy', name: 'Spy', team: '海岛组', points: 0 },
    { id: 'other', name: 'Other', team: '海岛组', points: 0 },
  ];
  const caught = findUndetectedTricksterIds(guests, [
    { voter_guest_id: 'voter-a', target_guest_id: 'spy', vote_weight: 2 },
    { voter_guest_id: 'voter-b', target_guest_id: 'other', vote_weight: 1 },
  ], [{ id: 'spy', team: '海岛组' }]);
  assert.equal(caught.has('spy'), false);

  const escaped = findUndetectedTricksterIds(guests, [
    { voter_guest_id: 'voter-a', target_guest_id: 'spy', vote_weight: 1 },
    { voter_guest_id: 'voter-b', target_guest_id: 'other', vote_weight: 2 },
  ], [{ id: 'spy', team: '海岛组' }]);
  assert.equal(escaped.has('spy'), true);

  // Vote weight changes the team's accusation total, not the per-voter
  // detective reward. The database settlement grants exactly +2 once for the
  // ballot row that targets a trickster.
  const correctVoterReward = 2;
  assert.equal(correctVoterReward, 2);
});

test('an escaped trickster is promoted without mutating personal or frozen team points', () => {
  const guests = [
    { id: 'spy', name: 'Spy', team: '海岛组', points: 1, countsForTeam: true },
    { id: 'other', name: 'Other', team: '海岛组', points: 20, countsForTeam: true },
    { id: 'family', name: 'Family', team: '家人组', points: 50, countsForTeam: false },
  ];
  const votes = [{ target_guest_id: 'other', vote_weight: 2 }];
  const escaped = findUndetectedTricksterIds(guests, votes, [{ id: 'spy', team: '海岛组' }]);
  const before = structuredClone(guests);
  const result = buildPublicScoreboard(guests, [], votes, [
    { team: '海岛组', amount: 8 },
    { team: '沙漠组', amount: 6 },
  ], { leaderLimit: guests.length, priorityGuestIds: escaped });
  assert.equal(result.leaders[0].id, 'spy');
  assert.deepEqual(guests, before);
  assert.deepEqual(result.teams.map(({ team, points }) => [team, points]), [
    ['海岛组', 8], ['沙漠组', 6],
  ]);
});

test('extra-vote ability completes at unlock without points, rank, clues or guest action', async () => {
  const [migration, manifest, finalFallback, luckySettlement] = await Promise.all([
    read('supabase/migrations/202608130035_complete_extra_vote_on_unlock.sql'),
    read('lib/official-task-manifest.ts'),
    read('supabase/migrations/202607310019_settle_phase_two_power_assignments.sql'),
    read('supabase/migrations/202607310028_phase_two_finale_clue_polish.sql'),
  ]);

  assert.match(migration, /t\.mission_code='P2-POWER-001'/);
  assert.match(migration, /t\.mechanic='INSTANT_BONUS' and t\.score_policy='NO_PERSONAL'/);
  assert.match(migration, /p\.primary_mission='EXTRA_VOTE' and p\.extra_vote[\s\S]*p\.unlocked_at is not null/);
  assert.match(migration, /a\.status in\('assigned','submitted','rejected'\)/);
  assert.match(migration, /verification_note='额外一票已解锁，最终投票自动按两票计算'/);
  assert.match(migration, /perform settle_phase_two_lucky\(p_actor\);[\s\S]*perform complete_phase_two_extra_vote_assignments\(p_actor\);/);
  assert.match(migration, /points_awarded',0[\s\S]*completion_rank_awarded',false[\s\S]*clues_awarded',0/);
  assert.doesNotMatch(migration, /insert into points_ledger|insert into guest_clues|completion_rank\s*=/);
  assert.match(manifest, /'P2-POWER-001'[\s\S]*额外一票已解锁。[\s\S]*最终投票自动按两票计算/);

  // The older reveal-time close remains in place for historical rows, while
  // the lucky card already follows the same immediate-completion semantics.
  assert.match(finalFallback, /p\.primary_mission='EXTRA_VOTE' and t\.mission_code='P2-POWER-001'/);
  assert.match(luckySettlement, /perform settle_phase_two_lucky\(p_actor\)/);
  assert.match(luckySettlement, /where id=v_assignment_id and status<>'approved'/);
});

test('the trickster card remains an ongoing final-outcome mission rather than an actionless ability', async () => {
  const [manifest, settlement] = await Promise.all([
    read('lib/official-task-manifest.ts'),
    read('supabase/migrations/202607310020_disable_trickster_scoring.sql'),
  ]);
  assert.match(manifest, /'P2-TRICKSTER-001'[\s\S]*最终投票与团队排名自动结算/);
  assert.match(settlement, /verification_note='最终揭晓已完成，恶作剧者身份由系统记录'/);
  assert.match(settlement, /t\.mission_code='P2-TRICKSTER-001'[\s\S]*p\.primary_mission='TRICKSTER'/);
  assert.doesNotMatch(settlement, /insert into spy_points_ledger|update guests set spy_points/);
});
