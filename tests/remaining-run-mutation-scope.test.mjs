import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const wrapped = [
  ['reset_rehearsal_data_for_run', 'text,boolean,text,uuid,text,uuid', 'reset_rehearsal_data'],
  ['reset_guest_claim_for_run', 'uuid,text,uuid', 'reset_guest_claim'],
  ['save_game_clue_v3_for_run', 'uuid,text,text,text,text,text,uuid', 'save_game_clue_v3'],
  ['deactivate_game_clue_for_run', 'uuid,text,uuid', 'deactivate_game_clue'],
  ['save_award_for_run', 'uuid,text,uuid,text,text,integer,boolean,text,uuid', 'save_award'],
  ['configure_phase_two_profile_for_run', 'uuid,text,boolean,boolean,boolean,text,text,uuid', 'configure_phase_two_profile'],
];

test('remaining rehearsal-owned admin mutations fail closed against stale pages', async () => {
  const migration = await read('supabase/migrations/202608130022_scope_remaining_run_mutations.sql');

  for (const [wrapper, signature, legacy] of wrapped) {
    const start = migration.indexOf(`create or replace function ${wrapper}`);
    assert.ok(start >= 0, `${wrapper} must exist`);
    const next = migration.indexOf('create or replace function ', start + 1);
    const definition = migration.slice(start, next < 0 ? migration.indexOf('-- Only the wrappers') : next);
    assert.match(definition, /perform assert_current_rehearsal_run\(p_rehearsal_run_id\)/);
    assert.ok(
      definition.indexOf('assert_current_rehearsal_run') < definition.indexOf(`${legacy}(`),
      `${wrapper} must validate the run before invoking ${legacy}`,
    );
    assert.match(migration, new RegExp(`revoke all on function ${wrapper}\\(${signature}\\)[\\s\\S]*?from public,anon,authenticated`));
    assert.match(migration, new RegExp(`grant execute on function ${wrapper}\\(${signature}\\)[\\s\\S]*?to service_role`));
  }

  for (const [legacy, signature] of [
    ['reset_rehearsal_data', 'text,boolean,text,uuid,text'],
    ['reset_guest_claim', 'uuid,text'],
    ['save_game_clue_v3', 'uuid,text,text,text,text,text'],
    ['deactivate_game_clue', 'uuid,text'],
    ['save_award', 'uuid,text,uuid,text,text,integer,boolean,text'],
    ['configure_phase_two_profile', 'uuid,text,boolean,boolean,boolean,text,text'],
  ]) {
    assert.match(migration, new RegExp(`revoke all on function ${legacy}\\(${signature}\\)[\\s\\S]*?from public,anon,authenticated,service_role`));
  }
});

test('route, data and direct reset UI carry the displayed run id', async () => {
  const [route, data, page] = await Promise.all([
    read('app/api/admin-action/route.ts'),
    read('lib/data/admin.ts'),
    read('app/admin/page.tsx'),
  ]);

  for (const type of [
    'resetGuestClaim',
    'resetRehearsal',
    'deactivateClue',
    'configurePhaseTwoProfile',
    'saveClue',
    'saveAward',
  ]) {
    const start = route.indexOf(`type === '${type}'`);
    assert.ok(start >= 0, `${type} route must exist`);
    const next = route.indexOf("type === '", start + 10);
    assert.match(route.slice(start, next < 0 ? undefined : next), /currentRunId\(\)/);
  }

  for (const [rpc] of wrapped) assert.match(data, new RegExp(`rpc\\('${rpc}'`));
  assert.equal((data.match(/p_rehearsal_run_id: rehearsalRunId/g) ?? []).length >= wrapped.length, true);
  assert.match(page, /type: 'resetRehearsal'[\s\S]*?rehearsalRunId: data\?\.game\?\.rehearsal_run_id/);
});

test('security settings and the task catalog remain deliberate cross-run exceptions', async () => {
  const [migration, data] = await Promise.all([
    read('supabase/migrations/202608130022_scope_remaining_run_mutations.sql'),
    read('lib/data/admin.ts'),
  ]);

  // These settings are either credentials or static catalog configuration.
  // Roster and role presets are also durable, but their writes are now guarded
  // by the run that was displayed when the operator opened the dashboard.
  for (const stableRpc of [
    'set_invitation_code',
    'save_game_task',
  ]) {
    assert.doesNotMatch(migration, new RegExp(`${stableRpc}_for_run`));
    assert.match(data, new RegExp(`rpc\\('${stableRpc}'`));
  }
});
