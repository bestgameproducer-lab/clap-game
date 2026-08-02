import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildWeddingPreflight, PHASE_ONE_MISSION_SPECS, WEDDING_TEAMS } from '../lib/preflight.ts';

function completeFixture() {
  const competitiveGuests = WEDDING_TEAMS.flatMap((team, teamIndex) => Array.from({ length: 10 }, (_, index) => ({
    id: `${teamIndex}-${index}`, active: true, team,
    role: index === 0 ? 'spy' : 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: true, role_locked: true, participation_mode: 'ACTIVE_PLAYER', story_role: 'NONE', phase_two_eligible: true,
  })));
  const taskFamily = Array.from({ length: 3 }, (_, index) => ({
    id: `family-task-${index}`, active: true, team: '家人组', role: 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: true, role_locked: true, participation_mode: 'ACTIVE_PLAYER', story_role: 'NONE', phase_two_eligible: false,
  }));
  const honorFamily = Array.from({ length: 7 }, (_, index) => ({
    id: `family-honor-${index}`, active: true, team: '家人组', role: 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: true, role_locked: true, participation_mode: 'HONOR_GUEST', story_role: 'NONE', phase_two_eligible: false,
  }));
  const principals = Array.from({ length: 2 }, (_, index) => ({
    id: `principal-${index}`, active: true, team: '未分组', role: 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: false, role_locked: false, participation_mode: 'PRINCIPAL', story_role: 'NONE', phase_two_eligible: false,
  }));
  const guests = [...competitiveGuests, ...taskFamily, ...honorFamily, ...principals];
  const storyRoles = ['OFFICIANT','RING_KEEPER','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER'];
  const storyIndexes = [1,20,21,2,3];
  storyRoles.forEach((role, index) => { guests[storyIndexes[index]].story_role = role; });
  const tasks = [
    ...PHASE_ONE_MISSION_SPECS.map(([mission_code, points, max_assignments], index) => ({ id: `official-${index}`, active: true, role_scope: 'guest', category: 'standard', stage: 'task_round_1', mission_code, points, max_assignments })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `upgrade-${index}`, active: true, role_scope: 'all', category: 'upgrade', stage: 'task_round_2' })),
    { id: 'group', active: true, role_scope: 'all', category: 'group', stage: 'group_game' },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `hidden-${index}`, active: true, role_scope: 'all', category: 'hidden', stage: 'task_round_2' })),
  ];
  return {
    guests, tasks, hasGameState: true, invitationCodeRotated: true,
  };
}

test('a complete 32-person rehearsal configuration passes every preflight gate', () => {
  const result = buildWeddingPreflight(completeFixture());
  assert.equal(result.ready, true);
  assert.equal(result.blockedCount, 0);
  assert.deepEqual(result.items.map((item) => item.id), [
    'game-state', 'invitation-code', 'guest-roster', 'draw-capacity', 'official-missions', 'story-cast',
  ]);
});

test('preflight blocks role capacity conflicts before card drawing', () => {
  const fixture = completeFixture();
  fixture.guests[2].role = 'spy';
  const result = buildWeddingPreflight(fixture);
  assert.equal(result.items.find((item) => item.id === 'draw-capacity')?.status, 'blocked');
  assert.equal(result.ready, false);
});

test('preflight accepts fixed teams whose roles are still random', () => {
  const fixture = completeFixture();
  for (const guest of fixture.guests.filter((item) => item.phase_two_eligible)) {
    guest.role = 'guest';
    guest.role_locked = false;
  }
  const result = buildWeddingPreflight(fixture);
  assert.equal(result.items.find((item) => item.id === 'draw-capacity')?.status, 'ready');
});

test('preflight allows random heart and star casting but blocks incomplete fixed roles and missions', () => {
  const fixture = completeFixture();
  fixture.guests.find((guest) => guest.story_role === 'GROOM_CHEERLEADER').story_role = 'NONE';
  fixture.tasks = fixture.tasks.filter((task) => task.mission_code !== 'P1-STAR-001');
  const result = buildWeddingPreflight(fixture);
  assert.equal(result.items.find((item) => item.id === 'story-cast')?.status, 'blocked');
  assert.equal(result.items.find((item) => item.id === 'official-missions')?.status, 'blocked');
});

test('preflight ignores optional live content that does not block the wedding opening', () => {
  const fixture = completeFixture();
  fixture.clues = [];
  fixture.hiddenTaskCodes = [];
  fixture.hostSegments = [];
  fixture.resourceWallets = [];
  const result = buildWeddingPreflight(fixture);
  assert.equal(result.ready, true);
  assert.equal(result.items.some((item) => ['upgrade-pool', 'group-pool', 'hidden-cards', 'team-clues', 'host-content', 'resource-wallets'].includes(item.id)), false);
});

test('the admin data layer keeps the opening check limited to core wedding setup', async () => {
  const source = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
  assert.match(source, /preflight: buildWeddingPreflight/);
  assert.match(source, /invitationCodeRotated: Boolean\(results\[5\]\.data\?\.invitation_code_updated_at\)/);
  assert.match(source, /buildWeddingPreflight\(\{ guests, tasks, hasGameState:/);
});

test('baseline migration brings the physical hidden-card pool to four', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607290027_baseline_hidden_task_card.sql', import.meta.url), 'utf8');
  assert.match(migration, /'祝福密令'/);
  assert.match(migration, /'all','hidden','task_round_2',true,false/);
  assert.match(migration, /where not exists\(select 1 from tasks where title='祝福密令'\)/);
});
