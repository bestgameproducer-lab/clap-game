import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const compatibilityPath = 'supabase/migrations/202608130029_predeploy_legacy_compatibility.sql';
const expansionPath = 'supabase/migrations/202608130030_expand_persistent_operator_run_scope.sql';
const contractPath = 'supabase/migrations/202608130031_postdeploy_contract_legacy_rpcs.sql';

const wrappers = [
  ['configure_guest_game_profile_for_run', 'uuid,text,text,text,uuid', 'configure_guest_game_profile', 'uuid,text,text,text'],
  ['configure_guest_story_role_for_run', 'uuid,text,text,uuid', 'configure_guest_story_role', 'uuid,text,text'],
  ['save_guest_roster_for_run', 'uuid,text,text,text,boolean,boolean,boolean,text,text,uuid', 'save_guest_roster', 'uuid,text,text,text,boolean,boolean,boolean,text,text'],
  ['import_guest_roster_for_run', 'jsonb,text,uuid', 'import_guest_roster', 'jsonb,text'],
];

function functionBody(source, name) {
  const start = source.indexOf(`create or replace function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf('create or replace function ', start + 1);
  return source.slice(start, next < 0 ? source.indexOf('-- Only the run-scoped wrappers', start) : next);
}

test('persistent operator edits reject a dashboard from before the latest reset', async () => {
  const [expansion, contract] = await Promise.all([read(expansionPath), read(contractPath)]);

  for (const [wrapper, wrapperSignature, canonical, canonicalSignature] of wrappers) {
    const definition = functionBody(expansion, wrapper);
    const runGuard = definition.indexOf('perform assert_current_rehearsal_run(p_rehearsal_run_id)');
    const mutation = definition.indexOf(`${canonical}(`);
    assert.ok(runGuard >= 0, `${wrapper} must validate the current rehearsal`);
    assert.ok(mutation > runGuard, `${wrapper} must validate before ${canonical}`);
    assert.match(
      contract,
      new RegExp(`revoke all on function ${canonical}\\(${canonicalSignature}\\)[\\s\\S]*?from public,anon,authenticated,service_role`),
    );
    assert.match(
      expansion,
      new RegExp(`revoke all on function ${wrapper}\\(${wrapperSignature}\\)[\\s\\S]*?from public,anon,authenticated`),
    );
    assert.match(
      expansion,
      new RegExp(`grant execute on function ${wrapper}\\(${wrapperSignature}\\)[\\s\\S]*?to service_role`),
    );
  }
});

test('database rollout preserves the old build until the post-deploy contract', async () => {
  const [compatibility, expansion, contract] = await Promise.all([
    read(compatibilityPath), read(expansionPath), read(contractPath),
  ]);
  const temporaryLegacySignatures = [
    'adjust_host_guest_points(uuid,integer,text,uuid,text)',
    'adjust_host_team_points(text,integer,text,uuid,text)',
    'set_game_stage(text,text)',
    'set_game_flag(text,boolean,text)',
    'set_registration_open(boolean,text)',
    'set_guest_phase_note(text,text)',
    'set_live_display(text,text,text,integer,text)',
    'settle_phase_two_team_clues(text)',
    'reset_rehearsal_data(text,boolean,text,uuid,text)',
    'reset_guest_claim(uuid,text)',
    'save_game_clue_v3(uuid,text,text,text,text,text)',
    'save_award(uuid,text,uuid,text,text,integer,boolean,text)',
    'configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text)',
    'consume_player_code_attempt(uuid)',
    'draw_guest_card(uuid)',
    'submit_assignment(uuid,uuid,text)',
    'cast_team_vote(uuid,uuid)',
    'submit_phase_two_dilemma(uuid,text)',
    'submit_phase_two_copy_choice(uuid,uuid)',
    'reveal_honor_special_card(uuid)',
    'request_player_connection(uuid,text,text)',
    'accept_player_connection(uuid,uuid)',
    'reject_player_connection(uuid,uuid)',
    'request_assignment_mutual_confirmation(uuid,uuid,text)',
    'respond_assignment_mutual_confirmation(uuid,uuid,boolean)',
    'confirm_guest_avatar(uuid,text)',
    'confirm_assignment_evidence(uuid,uuid,text)',
    'clear_assignment_evidence(uuid,uuid)',
    'approve_assignment_with_verification(uuid,text,text)',
    'reject_assignment(uuid,text,text)',
    'complete_assignment_at_station(uuid,text,text)',
    'assign_task_to_guest(uuid,uuid,text)',
    'reassign_task_assignment(uuid,uuid,text,text)',
    'update_ceremony_assignment(uuid,text,text,text)',
    'grant_guest_clue(uuid,uuid,text)',
    'undo_player_relationship(uuid,text,text)',
    'confirm_assignment_evidence_staff(uuid,text,text)',
    'clear_assignment_evidence_staff(uuid,text)',
  ];

  for (const signature of temporaryLegacySignatures) {
    const escaped = signature.replace(/[()]/g, '\\$&');
    assert.match(compatibility, new RegExp(`grant execute on function ${escaped} to service_role`));
    assert.match(contract, new RegExp(`revoke all on function ${escaped} from service_role`));
  }
  for (const [, , canonical, canonicalSignature] of wrappers) {
    const escaped = `${canonical}(${canonicalSignature})`.replace(/[()]/g, '\\$&');
    assert.match(compatibility, new RegExp(`grant execute on function ${escaped} to service_role`));
  }
  assert.doesNotMatch(expansion, /revoke all on function (configure_guest_game_profile|configure_guest_story_role|save_guest_roster|import_guest_roster)\(/);
  assert.match(contract, /APPLY ONLY AFTER the application build/);
});

test('admin route, data layer and standalone import carry the displayed run', async () => {
  const [route, data, page] = await Promise.all([
    read('app/api/admin-action/route.ts'),
    read('lib/data/admin.ts'),
    read('app/admin/page.tsx'),
  ]);

  for (const type of ['configureGuest', 'configureStoryRole', 'saveGuestRoster', 'importGuestRoster']) {
    const start = route.indexOf(`type === '${type}'`);
    assert.ok(start >= 0, `${type} route must exist`);
    const next = route.indexOf("type === '", start + 1);
    assert.match(route.slice(start, next < 0 ? undefined : next), /currentRunId\(\)/, `${type} must require the displayed run`);
  }

  for (const [wrapper] of wrappers) {
    assert.match(data, new RegExp(`\\.rpc\\('${wrapper}'[\\s\\S]*?p_rehearsal_run_id: rehearsalRunId`));
  }
  assert.match(page, /JSON\.stringify\(\{ \.\.\.body, rehearsalRunId: data\?\.game\?\.rehearsal_run_id \}\)/);
  assert.match(page, /type: 'importGuestRoster'[\s\S]*?rehearsalRunId: data\.game\.rehearsal_run_id/);
});

test('unused auction wallet mutation has no executable service entry point', async () => {
  const [contract, admin, host, station, guest] = await Promise.all([
    read(contractPath),
    read('lib/data/admin.ts'),
    read('lib/data/host.ts'),
    read('lib/data/station.ts'),
    read('lib/data/guest.ts'),
  ]);

  assert.match(
    contract,
    /revoke all on function adjust_team_resources\(text,integer,text,uuid,text\)[\s\S]*?from public,anon,authenticated,service_role/,
  );
  for (const source of [admin, host, station, guest]) {
    assert.doesNotMatch(source, /\.rpc\('adjust_team_resources'/);
  }
});
