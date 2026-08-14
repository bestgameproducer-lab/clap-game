import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin finale is irreversible and freezes every result-changing control', async () => {
  const [page, route, data] = await Promise.all([
    read('app/admin/page.tsx'),
    read('app/api/admin-action/route.ts'),
    read('lib/data/admin.ts'),
  ]);

  assert.match(page, /finalResultsLocked = Boolean\(data\.game\?\.results_published_at \|\| data\.resultRewards\.length > 0\)/);
  assert.match(page, /终局结果已发布，本场数据已冻结[\s\S]*?任务审核、个人积分、线索、奖项和任务配置不能再修改/);
  assert.match(page, /disabled=\{finalResultsLocked\}/);
  assert.match(page, /终局已永久发布/);
  assert.match(route, /if \(!publishResults\) throw new ApiError\(409,[\s\S]*?不能撤回/);
  assert.match(route, /setGameFlag\('results_visible', true, actor, currentRunId\(\)\)/);
  assert.match(data, /final_results_locked[\s\S]*?任务审核、积分、线索、奖项与任务配置均已冻结/);
  assert.match(data, /results_publication_irreversible[\s\S]*?一经发布不能撤回/);
});

test('manual clue grants use the official competitive-player boundary and can deactivate clues', async () => {
  const [page, route, data] = await Promise.all([
    read('app/admin/page.tsx'),
    read('app/api/admin-action/route.ts'),
    read('lib/data/admin.ts'),
  ]);
  const eligibility = page.slice(
    page.indexOf('const selectedGuestClueEligible'),
    page.indexOf('const activeCatalogTasks'),
  );

  assert.match(eligibility, /selectedGuest\?\.active/);
  assert.match(eligibility, /selectedGuest\.uses_app/);
  assert.match(eligibility, /selectedGuest\.drawn_at/);
  assert.match(eligibility, /selectedGuest\.phase_two_eligible/);
  assert.match(eligibility, /participation_mode === 'ACTIVE_PLAYER'/);
  assert.match(eligibility, /TEAMS\.includes/);
  assert.doesNotMatch(eligibility, /eligible_for_secret_role/);
  assert.match(page, /type: 'deactivateClue'/);
  assert.match(route, /type === 'deactivateClue'[\s\S]*?deactivateGameClue/);
  assert.match(data, /export async function deactivateGameClue[\s\S]*?rpc\('deactivate_game_clue_for_run'/);
});

test('official tasks are read-only and the retired physical hidden-card path has no operator control', async () => {
  const [page, route, data] = await Promise.all([
    read('app/admin/page.tsx'),
    read('app/api/admin-action/route.ts'),
    read('lib/data/admin.ts'),
  ]);

  assert.match(page, /officialLibraryTask = Boolean[\s\S]*?\/\^P\[12\]-\/i/);
  assert.match(page, /正式 P1\/P2 任务由版本化任务清单维护[\s\S]*?不能在婚礼现场修改或停用/);
  assert.doesNotMatch(page, /function issueCode/);
  assert.doesNotMatch(page, /type: 'issueHiddenTaskCode'/);
  assert.doesNotMatch(page, /grantsHiddenSpy/);
  assert.doesNotMatch(route, /issueHiddenTaskCode|redeemHiddenTaskCode/);
  assert.match(data, /hidden_spy_feature_retired[\s\S]*?功能已经取消/);
  assert.match(data, /official_task_catalog_locked[\s\S]*?正式婚礼任务由版本化任务清单维护/);
});

test('hidden-spy retirement detaches referenced clue targets without deleting history', async () => {
  const migration = await read('supabase/migrations/202608130011_lock_final_results_and_retire_hidden_spy.sql');
  const detach = migration.indexOf("'hidden_spy_clues.detached'");
  const roleClear = migration.indexOf("update guests set role=case when is_hidden_spy then 'guest'");

  assert.ok(detach >= 0 && detach < roleClear, 'referenced clues must be detached before changing the spy role');
  assert.match(migration, /update clues set active=false,spy_guest_id=null/);
  assert.match(migration, /clue_rows_preserved',true,'grants_preserved',true/);
  assert.doesNotMatch(migration.slice(0, roleClear), /delete from (?:clues|guest_clues)/);
});

test('database finale hardening freezes granted clue text and restricts ballots to competitive players', async () => {
  const migration = await read('supabase/migrations/202608130011_lock_final_results_and_retire_hidden_spy.sql');
  assert.match(migration, /granted_clue_content_locked/);
  assert.match(migration, /before update or delete on clues/);
  assert.match(migration, /voter_not_competitive/);
  assert.match(migration, /target_not_competitive/);
  assert.match(migration, /participation_mode<>'ACTIVE_PLAYER'/);
  assert.match(migration, /not v_voter\.phase_two_eligible/);
  assert.match(migration, /not v_target\.phase_two_eligible/);
  assert.match(migration, /t\.mission_code='P1-TRICKSTER-001'[\s\S]*p\.primary_mission='TRICKSTER'[\s\S]*p\.unlocked_at is not null/);
  for (const legacyRpc of [
    /create_game_task\(text,text,integer,text,text,text,text\)/,
    /create_game_clue\(text,text,text\)/,
    /save_game_clue\(uuid,text,text,boolean,uuid,integer,text\)/,
    /save_game_clue_v2\(uuid,text,text,text,text\)/,
    /save_alliance_clue_fragment\(text,text,text,text,boolean,text\)/,
  ]) {
    assert.match(migration, new RegExp(`revoke all on function ${legacyRpc.source} from public,anon,authenticated,service_role`));
  }
  for (const droppedSignature of [
    'public.save_game_task(uuid,text,text,integer,text,text,text,boolean,text)',
    'public.save_game_task(uuid,text,text,integer,text,text,text,boolean,boolean,text)',
    'public.save_game_clue(uuid,text,text,boolean,text)',
  ]) assert.ok(migration.includes(droppedSignature));
  assert.match(migration, /if to_regprocedure\(v_signature\) is not null then[\s\S]*execute 'revoke all on function '/);
});

test('every admin data RPC is explicitly classified at the terminal boundary', async () => {
  const [data, remainingLock, scoringLock, finaleLock] = await Promise.all([
    read('lib/data/admin.ts'),
    read('supabase/migrations/202608130012_lock_remaining_finale_mutations.sql'),
    read('supabase/migrations/202608130010_harden_staff_scoring_and_clue_grants.sql'),
    read('supabase/migrations/202608130011_lock_final_results_and_retire_hidden_spy.sql'),
  ]);

  const discovered = [...new Set([...data.matchAll(/\.rpc\('([^']+)'/g)].map((match) => match[1]))].sort();

  // Result-changing calls must reject after publication. A name belongs here
  // only when its effective database definition is guarded (or permanently
  // retired), so adding a new admin RPC forces this audit to be updated.
  const terminalLocked = [
    'adjust_staff_guest_points_for_run',
    'adjust_staff_team_points_for_run',
    'approve_assignment_with_verification_for_run',
    'assign_task_to_guest_for_run',
    'complete_assignment_at_station_for_run',
    'configure_guest_game_profile_for_run',
    'configure_guest_story_role_for_run',
    'configure_phase_two_profile_for_run',
    'deactivate_game_clue_for_run',
    'grant_guest_clue_for_run',
    'import_guest_roster_for_run',
    'reassign_task_assignment_for_run',
    'reject_assignment_for_run',
    'save_award_for_run',
    'save_game_clue_v3_for_run',
    'save_game_task',
    'save_guest_roster_for_run',
    'set_game_stage_for_run',
    'settle_phase_two_team_clues_for_run',
    'undo_player_relationship_for_run',
    'update_ceremony_assignment_for_run',
  ];

  // These are deliberately usable after publication because they are
  // read-only, display-only, credential recovery, safe closing controls, or
  // the explicit rehearsal reset path. set_game_flag_for_run is field-sensitive:
  // results/voting are frozen while scoreboard visibility remains operable.
  const intentionallyAllowed = [
    'preview_rehearsal_reset',
    'reconcile_rehearsal_storage_backlog',
    'reset_guest_claim_for_run',
    'reset_rehearsal_data_for_run',
    'set_game_flag_for_run',
    'set_guest_phase_note_for_run',
    'set_invitation_code',
    'set_live_display_for_run',
    'set_registration_open_for_run',
  ];

  assert.deepEqual(discovered, [...terminalLocked, ...intentionallyAllowed].sort());

  for (const rpc of [
    'assign_task_to_guest',
    'reassign_task_assignment',
    'update_ceremony_assignment',
    'configure_guest_game_profile',
    'configure_guest_story_role',
    'configure_phase_two_profile',
    'undo_player_relationship',
    'save_guest_roster',
    'import_guest_roster',
  ]) {
    assert.match(remainingLock, new RegExp(`create function ${rpc}\\([\\s\\S]*?perform assert_wedding_not_final\\(\\)`));
  }

  for (const rpc of ['adjust_staff_guest_points', 'adjust_staff_team_points', 'grant_guest_clue', 'settle_phase_two_team_clues']) {
    const start = scoringLock.indexOf(`create or replace function ${rpc}`);
    assert.ok(start >= 0, `${rpc} must have an effective hardened definition`);
    const next = scoringLock.indexOf('create or replace function ', start + 1);
    const definition = scoringLock.slice(start, next < 0 ? undefined : next);
    assert.match(definition, /final_results_locked|team_clues_settled_at/);
  }

  for (const rpc of [
    'approve_assignment',
    'reject_assignment',
    'save_award',
    'deactivate_game_clue',
    'save_game_clue_v3',
    'save_game_task',
  ]) {
    const start = finaleLock.indexOf(`create or replace function ${rpc}`);
    assert.ok(start >= 0, `${rpc} must have an effective hardened definition`);
    const next = finaleLock.indexOf('create or replace function ', start + 1);
    assert.match(finaleLock.slice(start, next < 0 ? undefined : next), /final_results_locked/);
  }
  assert.match(finaleLock, /revoke all on function save_alliance_clue_fragment\(text,text,text,text,boolean,text\) from public,anon,authenticated,service_role/);
});

test('admin derives the captain flag from the single phase-two mission selector', async () => {
  const page = await read('app/admin/page.tsx');
  const configuration = page.slice(
    page.indexOf('<h3>第二轮任务配置</h3>'),
    page.indexOf('</form>', page.indexOf('<h3>第二轮任务配置</h3>')),
  );

  assert.match(configuration, /<option value="">尚未指定<\/option>/);
  assert.match(page, /isCaptain: phaseTwoForm\.primaryMission === 'TEAM_CAPTAIN'/);
  assert.match(configuration, /isCaptain: primaryMission === 'TEAM_CAPTAIN'/);
  assert.doesNotMatch(configuration, /type="checkbox"/);
  assert.doesNotMatch(configuration, /队长是队内职责|队长身份/);
});

test('admin visibly freezes roster, roles, assignment and relationship controls after publication', async () => {
  const page = await read('app/admin/page.tsx');
  assert.match(page, /disabled=\{finalResultsLocked \|\| formalConfigurationLocked \|\| !selectedGuestCanPresetTrickster\}/);
  assert.match(page, /正式剧情职务由名单固定/);
  assert.match(page, /第二轮由流程统一派发/);
  assert.match(page, /disabled=\{finalResultsLocked \|\| Boolean\(selectedPhaseTwoProfile\?\.unlocked_at\)\}/);
  assert.match(page, /type: 'undoRelationship'[\s\S]*?终局后已冻结/);
  assert.match(page, /宾客名单和显示姓名已冻结[\s\S]*?<fieldset className="score-lock-fieldset" disabled=\{finalResultsLocked\}>/);
  assert.match(page, /终局结果已发布，本场数据已冻结/);
});

test('remaining guest and operational mutations share one terminal database guard', async () => {
  const migration = await read('supabase/migrations/202608130012_lock_remaining_finale_mutations.sql');
  const guarded = [
    'complete_system_mission',
    'draw_guest_card',
    'submit_assignment',
    'complete_assignment_at_station',
    'request_assignment_mutual_confirmation',
    'respond_assignment_mutual_confirmation',
    'request_player_connection',
    'accept_player_connection',
    'reject_player_connection',
    'submit_phase_two_dilemma',
    'submit_phase_two_copy_choice',
    'reveal_honor_special_card',
    'adjust_team_resources',
    'confirm_guest_avatar',
    'confirm_assignment_evidence',
    'clear_assignment_evidence',
    'confirm_assignment_evidence_staff',
    'clear_assignment_evidence_staff',
  ];

  for (const rpc of guarded) {
    assert.match(
      migration,
      new RegExp(`create function ${rpc}\\([\\s\\S]*?perform assert_wedding_not_final\\(\\)`),
      `${rpc} must fail closed after terminal publication`,
    );
  }

  assert.match(migration, /p_reason text default '任务站现场核验通过'/);
  for (const internalRpc of [
    'settle_phase_two_lucky',
    'settle_phase_two_copy_and_captain',
    'settle_voting_results',
    'settle_spy_results',
    'finalize_phase_one_content',
    'unlock_phase_two_missions',
    'unlock_phase_two_missions_assignments_v1',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function ${internalRpc}\\([\\s\\S]*?service_role`));
  }
  assert.match(migration, /revoke all on function save_host_segment\([\s\S]*?service_role/);
  assert.match(migration, /revoke all on function publish_host_segment\(uuid,text\)[\s\S]*?service_role/);
});

test('avatar uploads fail closed before creating a signed upload after publication', async () => {
  const [avatar, migration] = await Promise.all([
    read('lib/data/avatar.ts'),
    read('supabase/migrations/202608130018_lock_signed_uploads_to_rehearsal_run.sql'),
  ]);
  assert.match(avatar, /\.rpc\('authorize_guest_avatar_upload'/);
  assert.ok(
    avatar.indexOf(".rpc('authorize_guest_avatar_upload'") < avatar.indexOf('createSignedUploadUrl'),
    'database authorization must run before creating a signed upload URL',
  );
  const authorization = migration.slice(
    migration.indexOf('create or replace function authorize_guest_avatar_upload'),
    migration.indexOf('create or replace function authorize_guest_assignment_evidence_upload'),
  );
  assert.match(authorization, /results_published_at is not null or exists\(select 1 from result_rewards\)/);
  assert.ok(authorization.indexOf('results_published_at is not null') < authorization.indexOf('return p_guest_id::text'));
  assert.match(avatar, /final_results_locked[\s\S]*?终局结果已发布，宾客头像已锁定/);
});

test('guest and staff evidence authorization checks both terminal signals before signing uploads', async () => {
  const [evidence, migration] = await Promise.all([
    read('lib/data/evidence.ts'),
    read('supabase/migrations/202608130018_lock_signed_uploads_to_rehearsal_run.sql'),
  ]);
  assert.match(evidence, /\.rpc\('authorize_guest_assignment_evidence_upload'/);
  assert.match(evidence, /\.rpc\('authorize_staff_assignment_evidence_upload_for_run'/);
  assert.ok(evidence.indexOf(".rpc('authorize_guest_assignment_evidence_upload'") < evidence.indexOf('createSignedUploadUrl'));
  const guestAuthorization = migration.slice(
    migration.indexOf('create or replace function authorize_guest_assignment_evidence_upload'),
    migration.indexOf('create or replace function authorize_staff_assignment_evidence_upload'),
  );
  const staffAuthorization = migration.slice(
    migration.indexOf('create or replace function authorize_staff_assignment_evidence_upload'),
    migration.indexOf('create or replace function confirm_guest_avatar'),
  );
  for (const authorization of [guestAuthorization, staffAuthorization]) {
    assert.match(authorization, /results_published_at is not null or exists\(select 1 from result_rewards\)/);
    assert.ok(authorization.indexOf('results_published_at is not null') < authorization.indexOf('return '));
  }
});

test('password recovery cannot silently remove an honor guest from published rankings', async () => {
  const migration = await read('supabase/migrations/202608130012_lock_remaining_finale_mutations.sql');
  const trigger = migration.slice(
    migration.indexOf('create or replace function reset_honor_special_card_with_claim'),
    migration.indexOf('-- Retire obsolete overloads'),
  );

  assert.match(trigger, /current_setting\('wedding\.rehearsal_reset',true\)[\s\S]*?special_card_revealed_at=null/);
  assert.match(trigger, /results_published_at is not null[\s\S]*?exists\(select 1 from result_rewards\)/);
  assert.match(trigger, /new\.special_card_revealed_at=old\.special_card_revealed_at/);
  assert.match(migration, /public\.claim_guest_identity\(text,uuid,text,text,timestamptz\)/);
  assert.match(migration, /public\.submit_assignment\(uuid,uuid\)/);
  assert.match(migration, /revoke all on function '[|]{2}v_signature[|]{2}' from public,anon,authenticated,service_role/);
});
