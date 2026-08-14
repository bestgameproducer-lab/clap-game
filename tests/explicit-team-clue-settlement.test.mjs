import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('team clue settlement is explicit, ranked, audited, and reset-safe', async () => {
  const migration = await read('supabase/migrations/202607310032_explicit_team_clue_settlement.sql');
  assert.match(migration, /stage<>'group_game'/);
  assert.match(migration, /dense_rank\(\) over\(order by score desc\)/);
  assert.match(migration, /team_clues_settled_at=now\(\)/);
  assert.match(migration, /on conflict\(guest_id,clue_id\) do nothing/);
  assert.match(migration, /phase_two\.team_clues_settle/);
  assert.match(migration, /rehearsal_reset_team_clue_settlement/);
  assert.match(migration, /message='team_scores_already_settled'/);
  assert.match(migration, /create or replace function adjust_host_team_points/);
  assert.doesNotMatch(migration, /truncate/);
});

test('current hardened team clue settlement never reintroduces unsupported min(uuid)', async () => {
  const migration = await read('supabase/migrations/202608130010_harden_staff_scoring_and_clue_grants.sql');
  const settlement = migration.slice(migration.indexOf('create or replace function settle_phase_two_team_clues'));

  assert.match(settlement, /\(array_agg\(id order by id\)\)\[1\],count\(\*\)::integer into v_spy_id,v_spy_count/);
  assert.doesNotMatch(settlement, /select min\(id\),count\(\*\)::integer into v_spy_id/);
});

test('admin and host expose the same authenticated pre-vote settlement action', async () => {
  const [adminRoute, hostRoute, adminData, hostData] = await Promise.all([
    read('app/api/admin-action/route.ts'), read('app/api/host-action/route.ts'),
    read('lib/data/admin.ts'), read('lib/data/host.ts'),
  ]);
  for (const source of [adminRoute, hostRoute]) assert.match(source, /type === 'settleTeamClues'/);
  assert.match(adminData, /settleTeamChallengeClues/);
  assert.match(hostData, /settleHostTeamChallengeClues/);
  for (const source of [adminData, hostData]) assert.match(source, /rpc\('settle_phase_two_team_clues_for_run'/);
});

test('seed placeholders are removed without deleting issued clue history', async () => {
  const [migration, seed] = await Promise.all([
    read('supabase/migrations/202607310032_explicit_team_clue_settlement.sql'),
    read('supabase/seed-example.sql'),
  ]);
  assert.match(migration, /title in \('示例线索一','示例线索二'\)/);
  assert.match(migration, /exists\(select 1 from guest_clues/);
  assert.doesNotMatch(seed, /示例线索一|示例线索二/);
});

test('legacy generic placeholders are removed forward-only and settlement readiness is visible', async () => {
  const [migration, admin, host, hostData] = await Promise.all([
    read('supabase/migrations/202608010001_remove_legacy_generic_clues.sql'),
    read('app/admin/page.tsx'), read('app/host/page.tsx'), read('lib/data/host.ts'),
  ]);
  assert.match(migration, /group_name='通用线索'/);
  assert.match(migration, /title='秘密线索'/);
  assert.match(migration, /not exists\(select 1 from guest_clues/);
  assert.match(migration, /set active=false/);
  assert.doesNotMatch(migration, /truncate|delete from guest_clues/i);
  for (const page of [admin, host]) {
    assert.match(page, /teamSettlementReady/);
    assert.match(page, /恶作剧者 \$\{check\.spies\}\/1/);
    assert.match(page, /线索 \$\{check\.clues\}\/\$\{check\.requiredClues\}/);
    assert.match(page, /check\.clues >= check\.requiredClues/);
  }
  assert.match(hostData, /select\('team_scope,active,spy_guest_id'\)/);
  assert.match(hostData, /teamClueCounts/);
});
