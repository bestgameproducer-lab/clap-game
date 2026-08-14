import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildWeddingPreflight, WEDDING_TEAMS } from '../lib/preflight.ts';
import { auditOfficialTaskCatalog, OFFICIAL_TASK_FIELDS, OFFICIAL_TASK_MANIFEST } from '../lib/official-task-manifest.ts';

function completeFixture() {
  const competitiveGuests = WEDDING_TEAMS.flatMap((team, teamIndex) => Array.from({ length: 10 }, (_, index) => ({
    id: `${teamIndex}-${index}`, active: true, team,
    role: index === 0 ? 'spy' : 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: true, role_locked: true, participation_mode: 'ACTIVE_PLAYER', story_role: 'NONE', phase_two_eligible: true,
  })));
  const taskFamily = Array.from({ length: 4 }, (_, index) => ({
    id: `family-task-${index}`, active: true, team: '家人组', role: 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: true, role_locked: true, participation_mode: 'ACTIVE_PLAYER', story_role: 'NONE', phase_two_eligible: false,
  }));
  taskFamily[3].login_name = 'Tianran Chen & Ziyou Chen';
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
  const fixedLoginNames = ['yifan yu','xingcheng jin','andao chen','siran li','moshuang xu'];
  storyIndexes.forEach((guestIndex, index) => { guests[guestIndex].login_name = fixedLoginNames[index]; });
  storyRoles.forEach((role, index) => { guests[storyIndexes[index]].story_role = role; });
  const tasks = [
    ...OFFICIAL_TASK_MANIFEST.map((task, index) => ({ id: `official-${index}`, ...task })),
    { id: 'group', active: true, role_scope: 'all', category: 'group', stage: 'group_game' },
    ...Array.from({ length: 4 }, (_, index) => ({ id: `hidden-${index}`, active: true, role_scope: 'all', category: 'hidden', stage: 'task_round_2' })),
  ];
  return {
    guests, tasks, hasGameState: true, invitationCodeRotated: true,
  };
}

test('a complete 34-person, 33-account rehearsal configuration passes every preflight gate', () => {
  const result = buildWeddingPreflight(completeFixture());
  assert.equal(result.ready, true);
  assert.equal(result.blockedCount, 0);
  assert.deepEqual(result.items.map((item) => item.id), [
    'game-state', 'invitation-code', 'guest-roster', 'draw-capacity', 'official-missions', 'phase-one-capacity', 'story-cast',
  ]);
});

test('preflight blocks an incomplete 24-account first-act draw roster', () => {
  const fixture = completeFixture();
  fixture.guests.find((guest) => guest.login_name === 'Tianran Chen & Ziyou Chen').active = false;
  const result = buildWeddingPreflight(fixture);
  assert.equal(result.items.find((item) => item.id === 'phase-one-capacity')?.status, 'blocked');
  assert.equal(result.ready, false);
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

test('preflight blocks a phase-two task whose runtime behavior differs from the official manifest', () => {
  const fixture = completeFixture();
  const task = fixture.tasks.find((entry) => entry.mission_code === 'P2-HEART-001');
  task.verification_type = 'PHOTO';
  const result = buildWeddingPreflight(fixture);
  const gate = result.items.find((entry) => entry.id === 'official-missions');
  assert.equal(gate?.status, 'blocked');
  assert.match(gate?.detail ?? '', /P2-HEART-001\(verification_type\)/);
});

test('preflight blocks missing, duplicate, demo, and unexpected active formal tasks', () => {
  const fixture = completeFixture();
  fixture.tasks = fixture.tasks.filter((task) => task.mission_code !== 'P2-GUIDE-001');
  const duplicate = { ...fixture.tasks.find((task) => task.mission_code === 'P1-CER-001'), id: 'duplicate' };
  fixture.tasks.push(duplicate);
  fixture.tasks.find((task) => task.mission_code === 'P1-STAR-001').is_demo = true;
  fixture.tasks.push({ id: 'unknown-formal', active: true, is_demo: false, role_scope: 'guest', category: 'standard', stage: 'task_round_2', mission_code: 'P2-UNKNOWN-001' });
  const result = buildWeddingPreflight(fixture);
  const gate = result.items.find((entry) => entry.id === 'official-missions');
  assert.equal(gate?.status, 'blocked');
  assert.match(gate?.detail ?? '', /缺少 P2-GUIDE-001/);
  assert.match(gate?.detail ?? '', /重复 P1-CER-001/);
  assert.match(gate?.detail ?? '', /P1-STAR-001\(is_demo\)/);
  assert.match(gate?.detail ?? '', /未收录 P2-UNKNOWN-001/);
});

test('official catalog audit permits manual tasks without a formal P1/P2 mission code', () => {
  const audit = auditOfficialTaskCatalog([
    ...OFFICIAL_TASK_MANIFEST,
    { active: true, is_demo: false, mission_code: null, role_scope: 'all', category: 'standard', stage: 'task_round_2' },
  ]);
  assert.equal(audit.ready, true);
});

test('official catalog audit checks every server-authoritative task field', () => {
  for (const field of OFFICIAL_TASK_FIELDS) {
    const tasks = OFFICIAL_TASK_MANIFEST.map((task) => ({ ...task }));
    const target = tasks.find((task) => task.mission_code === 'P2-SOCIAL-001');
    if (field === 'active') target[field] = false;
    else if (field === 'is_demo') target[field] = true;
    else if (field === 'points') target[field] += 1;
    else if (field === 'max_assignments') target[field] = 99;
    else target[field] = `INVALID_${field}`;
    const audit = auditOfficialTaskCatalog(tasks);
    assert.equal(audit.ready, false, `${field} must block preflight`);
    assert.deepEqual(audit.mismatches, [{ missionCode: 'P2-SOCIAL-001', fields: [field] }]);
  }
});

test('preflight rejects the retired applause role', () => {
  const fixture = completeFixture();
  fixture.guests[4].story_role = 'APPLAUSE_STARTER';
  const result = buildWeddingPreflight(fixture);
  assert.equal(result.items.find((entry) => entry.id === 'story-cast')?.status, 'blocked');
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
  assert.match(source, /const basePreflight = buildWeddingPreflight/);
  assert.match(source, /const preflight = storageSafetyBlocked/);
  assert.match(source, /invitationCodeRotated: Boolean\(results\[5\]\.data\?\.invitation_code_updated_at\)/);
  assert.match(source, /buildWeddingPreflight\(\{[\s\S]*guests:[\s\S]*tasks,[\s\S]*hasGameState:/);
});

test('latest hardening retires the obsolete hidden-card pool and code redemption', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202608130011_lock_final_results_and_retire_hidden_spy.sql', import.meta.url), 'utf8');
  assert.match(migration, /update tasks set active=false where grants_hidden_spy and active/);
  assert.match(migration, /create or replace function redeem_hidden_task_code/);
  assert.match(migration, /raise exception 'hidden_task_codes_retired'/);
});
