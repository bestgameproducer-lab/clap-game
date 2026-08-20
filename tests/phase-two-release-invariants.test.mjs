import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildWeddingPreflight, WEDDING_TEAMS } from '../lib/preflight.ts';
import { OFFICIAL_TASK_MANIFEST, auditOfficialTaskCatalog } from '../lib/official-task-manifest.ts';

const migration = await readFile(
  new URL('../supabase/migrations/202608130003_harden_phase_two_release_invariants.sql', import.meta.url),
  'utf8',
);

function preflightFixture() {
  const competitive = WEDDING_TEAMS.flatMap((team, teamIndex) => Array.from({ length: 10 }, (_, index) => ({
    id: `${teamIndex}-${index}`,
    active: true,
    team,
    role: index === 0 ? 'spy' : 'guest',
    is_hidden_spy: false,
    drawn_at: null,
    team_locked: true,
    role_locked: true,
    participation_mode: 'ACTIVE_PLAYER',
    story_role: 'NONE',
    phase_two_eligible: true,
  })));
  const familyPlayers = Array.from({ length: 3 }, (_, index) => ({
    id: `family-player-${index}`, active: true, team: '家人组', role: 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: true, role_locked: true, participation_mode: 'ACTIVE_PLAYER',
    story_role: 'NONE', phase_two_eligible: false,
  }));
  const familyHonorGuests = Array.from({ length: 7 }, (_, index) => ({
    id: `family-honor-${index}`, active: true, team: '家人组', role: 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: true, role_locked: true, participation_mode: 'HONOR_GUEST',
    story_role: 'NONE', phase_two_eligible: false,
  }));
  const principals = Array.from({ length: 2 }, (_, index) => ({
    id: `principal-${index}`, active: true, team: '未分组', role: 'guest', is_hidden_spy: false,
    drawn_at: null, team_locked: false, role_locked: false, participation_mode: 'PRINCIPAL',
    story_role: 'NONE', phase_two_eligible: false,
  }));
  const guests = [...competitive, ...familyPlayers, ...familyHonorGuests, ...principals];
  guests[1].story_role = 'OFFICIANT';
  guests[20].story_role = 'RING_KEEPER';
  guests[21].story_role = 'RING_KEEPER';
  return {
    guests,
    tasks: OFFICIAL_TASK_MANIFEST.map((task, index) => ({ id: `task-${index}`, ...task })),
    hasGameState: true,
    invitationCodeRotated: true,
  };
}

test('preflight requires exactly ten competitive accounts in each team', () => {
  const fixture = preflightFixture();
  fixture.guests.find((guest) => guest.team === '海岛组').team = '未分组';
  const result = buildWeddingPreflight(fixture);
  const gate = result.items.find((entry) => entry.id === 'draw-capacity');
  assert.equal(gate?.status, 'blocked');
  assert.match(gate?.detail ?? '', /海岛组 9\/10/);
});

test('official task audit rejects stale title, instructions, and verification copy', () => {
  for (const field of ['title', 'description', 'verification_method']) {
    const tasks = OFFICIAL_TASK_MANIFEST.map((task) => ({ ...task }));
    tasks.find((task) => task.mission_code === 'P2-SOCIAL-001')[field] = '婚礼记者';
    const audit = auditOfficialTaskCatalog(tasks);
    assert.equal(audit.ready, false);
    assert.deepEqual(audit.mismatches, [{ missionCode: 'P2-SOCIAL-001', fields: [field] }]);
  }
});

test('migration cancels every non-official second-act assignment without deleting history', () => {
  const retirement = migration.slice(
    migration.indexOf('-- Any superseded dinner assignment'),
    migration.indexOf('create or replace function phase_two_official_assignment_set_complete'),
  );
  assert.match(retirement, /t\.stage='task_round_2' or coalesce\(t\.mission_code,''\) like 'P2-%'/);
  assert.match(retirement, /a\.status<>'cancelled'/);
  assert.match(retirement, /status='cancelled'/);
  assert.match(retirement, /previous_status/);
  assert.match(retirement, /points_ledger_preserved',true/);
  assert.match(retirement, /evidence_preserved',true/);
  assert.doesNotMatch(retirement, /delete\s+from\s+(assignments|points_ledger)/i);
  assert.match(retirement, /update tasks set active=false/);
});

test('migration retires only the six obsolete seeded group tasks and preserves future custom tasks', () => {
  const groupRetirement = migration.slice(
    migration.indexOf('-- The original 202607280009 seed also left six'),
    migration.indexOf('create or replace function phase_two_official_assignment_set_complete'),
  );
  for (const title of ['团队记录员', '十秒提醒', '意见收集者', '最终答题人', '友好挑战', '讨论总结']) {
    assert.match(groupRetirement, new RegExp(title));
  }
  assert.match(groupRetirement, /t\.mission_code is null/);
  assert.match(groupRetirement, /t\.stage='group_game'/);
  assert.match(groupRetirement, /t\.category='group'/);
  assert.match(groupRetirement, /status='cancelled'/);
  assert.match(groupRetirement, /update tasks set active=false/);
  assert.match(groupRetirement, /future_custom_group_tasks_preserved',true/);
  assert.doesNotMatch(groupRetirement, /where\s+mission_code is null\s+and\s+stage='group_game'\s+and\s+category='group'\s+and\s+active/i);
});

test('complete phase two means exact 10/10 drawn roster and exactly 20 matching official assignments', () => {
  const completeness = migration.slice(
    migration.indexOf('create or replace function phase_two_official_assignment_set_complete'),
    migration.indexOf('create or replace function set_game_stage'),
  );
  assert.match(completeness, /phase_two_profiles where team='海岛组'\)<>10/);
  assert.match(completeness, /phase_two_profiles where team='沙漠组'\)<>10/);
  assert.match(completeness, /phase_two_eligible and drawn_at is not null and team='海岛组'\)<>10/);
  assert.match(completeness, /phase_two_eligible and drawn_at is not null and team='沙漠组'\)<>10/);
  assert.match(completeness, /participation_mode<>'ACTIVE_PLAYER'/);
  assert.match(completeness, /g\.is_hidden_spy/);
  assert.match(completeness, /\(p\.primary_mission='TRICKSTER'\) is distinct from \(g\.role='spy'\)/);
  assert.match(completeness, /t\.active and not t\.is_demo/);
  assert.match(completeness, /\)<>20 then/);
  assert.match(completeness, /count\(\*\) filter\(where t\.mission_code like 'P2-%'\)<>1/);
  assert.match(completeness, /coalesce\(t\.mission_code,''\) not in/);
  assert.match(completeness, /language plpgsql\s+volatile/);
  assert.match(completeness, /p\.is_captain is distinct from \(p\.primary_mission='TEAM_CAPTAIN'\)/);
  assert.match(completeness, /primary_mission='EXTRA_VOTE'\)<>1/);
});

test('formal opening is protected by database catalog and roster gates', () => {
  assert.match(migration, /create or replace function formal_wedding_catalog_ready\(\)/);
  assert.match(migration, /create or replace function formal_wedding_roster_ready\(\)/);
  assert.match(migration, /formal_allowed boolean not null default false/);
  assert.match(migration, /select count\(\*\) from guests where active\)=33/);
  assert.match(migration, /\('tianran chen & ziyou chen','家人组','ACTIVE_PLAYER',false,true,true\)/);
  for (const login of ['danying yang', 'liying jin', 'jianjun jin', 'xiaofeng jin', 'wei jin', 'huimin xu', 'gang yao']) {
    assert.match(migration, new RegExp(`\\('${login}','家人组','HONOR_GUEST',false,false,true\\)`));
  }
  assert.match(migration, /update guests set eligible_for_personal_score=true[\s\S]*participation_mode='HONOR_GUEST'/);
  assert.match(migration, /guest\.honor_family_score_eligibility_repaired/);
  assert.match(migration, /\('yirui zhang','海岛组','ACTIVE_PLAYER',true,true,true\)/);
  assert.match(migration, /\('junheng liu','沙漠组','ACTIVE_PLAYER',true,true,true\)/);
  assert.match(migration, /\('zimin jin',null::text,'PRINCIPAL',false,false,false\)/);
  assert.match(migration, /fixed_cast\(login_name,story_role\)/);
  assert.match(migration, /\('yifan yu','OFFICIANT'\)/);
  assert.match(migration, /\('xingcheng jin','RING_KEEPER'\)/);
  assert.match(migration, /\('andao chen','RING_KEEPER'\)/);
  assert.match(migration, /\('siran li','GROOM_CHEERLEADER'\)/);
  assert.match(migration, /\('moshuang xu','BRIDE_CHEERLEADER'\)/);
  assert.match(migration, /eligible_for_mission is distinct from e\.eligible_for_mission/);
  assert.match(migration, /eligible_for_personal_score is distinct from e\.eligible_for_personal_score/);
  assert.match(migration, /message='formal_wedding_preflight_not_ready'/);
  assert.match(migration, /v_state\.task_catalog_mode<>'live'/);
});

test('a direct database edit to any authoritative task field blocks registration', () => {
  const catalogGate = migration.slice(
    migration.indexOf('create or replace function formal_wedding_catalog_ready'),
    migration.indexOf('create or replace function formal_wedding_roster_ready'),
  );
  for (const field of [
    'title', 'description', 'verification_method', 'points', 'max_assignments',
    'role_scope', 'category', 'stage', 'story_role_scope', 'mechanic',
    'score_policy', 'assignment_mode', 'verification_type', 'active', 'is_demo',
    'grants_hidden_spy',
  ]) {
    assert.match(catalogGate, new RegExp(`t\\.${field} is distinct from e\\.${field}`), `${field} must be exact`);
  }
  assert.match(catalogGate, /t\.formal_allowed is distinct from true/);
  assert.match(catalogGate, /'P2-LONELY-001','孤单丘比特 · 命运复制'/);
  assert.match(catalogGate, /null::integer,'spy','hidden','task_round_1'/, 'null maxima must compare null-safely');

  const registrationGate = migration.slice(migration.indexOf('create or replace function set_registration_open'));
  assert.match(registrationGate, /not formal_wedding_catalog_ready\(\)/);
  assert.match(registrationGate, /message='formal_wedding_preflight_not_ready'/);
});

test('unlocked phase-two profiles freeze the assignment-bearing fields', () => {
  assert.match(migration, /create or replace function guard_unlocked_phase_two_profile\(\)/);
  assert.match(migration, /old\.unlocked_at is not null/);
  assert.match(migration, /new\.primary_mission is distinct from old\.primary_mission/);
  assert.match(migration, /message='phase_two_profile_locked'/);
  assert.match(migration, /before update or delete on phase_two_profiles/);
});

test('an unassigned ordinary phase-two profile remains null-safe while spy profiles stay explicit', () => {
  const configuration = migration.slice(
    migration.indexOf('create or replace function configure_phase_two_profile'),
    migration.indexOf('create or replace function set_game_stage'),
  );
  assert.match(configuration, /coalesce\(p_extra_vote,false\)<>coalesce\(p_primary_mission='EXTRA_VOTE',false\)/);
  assert.match(configuration, /coalesce\(p_super_lucky,false\)<>coalesce\(p_primary_mission='SUPER_LUCKY',false\)/);
  assert.match(configuration, /coalesce\(p_is_captain,false\)<>coalesce\(p_primary_mission='TEAM_CAPTAIN',false\)/);
  assert.match(configuration, /coalesce\(p_primary_mission='TRICKSTER',false\) is distinct from \(v_guest\.role='spy'\)/);
});

test('stage machine cannot bypass the prelude or publish an incomplete second act', () => {
  const stageMachine = migration.slice(migration.indexOf('create or replace function set_game_stage'));
  for (const transition of [
    "v_state.stage='registration' and p_stage='waiting'",
    "v_state.stage='waiting' and p_stage='task_round_1'",
    "v_state.stage='task_round_1' and p_stage='ceremony_end'",
    "v_state.stage='ceremony_end' and p_stage='task_round_2'",
    "v_state.stage='task_round_2' and p_stage='banquet'",
    "v_state.stage='banquet' and p_stage='group_game'",
  ]) assert.match(stageMachine, new RegExp(transition.replaceAll('(', '\\(').replaceAll(')', '\\)')));
  assert.match(stageMachine, /message='invalid_game_stage_transition'/);
  assert.match(stageMachine, /p_stage='task_round_2'[\s\S]*v_phase_two_count:=unlock_phase_two_missions\(p_actor\)/);
  assert.match(stageMachine, /p_stage in\('task_round_2','banquet','group_game'\)[\s\S]*not phase_two_official_assignment_set_complete\(\)/);
  assert.match(stageMachine, /message='phase_two_assignment_count_invalid'/);
  assert.ok(
    stageMachine.indexOf('not phase_two_official_assignment_set_complete()')
      < stageMachine.indexOf('update game_state set stage=p_stage'),
    'completeness must be checked before persisting the new stage',
  );
});
