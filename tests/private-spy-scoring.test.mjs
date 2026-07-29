import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607290025_private_spy_scoring.sql', import.meta.url), 'utf8');
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const publicData = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
const guestData = await readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const scoreboard = await readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8');

test('spy score is stored in a private ledger instead of public guest points', () => {
  assert.match(migration, /create table if not exists spy_points_ledger/);
  assert.match(migration, /alter table spy_points_ledger enable row level security/);
  assert.match(migration, /revoke all on spy_points_ledger from public, anon, authenticated/);
  const settle = migration.slice(migration.indexOf('create or replace function settle_spy_results'), migration.indexOf('-- Extend the established atomic reveal boundary'));
  assert.doesNotMatch(settle, /update guests set points|insert into points_ledger|insert into team_points_ledger/);
});

test('manual spy events are fixed, authenticated, audited, and idempotent', () => {
  const record = migration.slice(migration.indexOf('create or replace function record_spy_point_event'), migration.indexOf('create or replace function settle_spy_results'));
  assert.match(record, /p_reason not in \('team_wrong_answer','resource_wasted','ordinary_guest_suspected'\)/);
  assert.match(record, /v_guest\.drawn_at is null or v_guest\.role<>'spy'/);
  assert.match(record, /'manual:' \|\| p_event_key::text/);
  assert.match(record, /on conflict \(source_key\) do nothing/);
  assert.match(record, /'spy_points\.record'/);
  assert.match(adminRoute, /requireAdmin\(\)/);
  assert.match(adminRoute, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
});

test('final spy bonuses settle once at the result publication boundary', () => {
  assert.match(migration, /'final:escaped_vote:' \|\| v_spy\.id::text/);
  assert.match(migration, /v_spy\.team_votes=0 or v_spy\.spy_votes<v_spy\.top_votes/);
  assert.match(migration, /v_top_team_score>0 and v_spy\.team_score=v_top_team_score/);
  assert.match(migration, /v_spy\.spy_task_count>0 and v_spy\.approved_spy_task_count=v_spy\.spy_task_count/);
  assert.match(migration, /perform settle_voting_results\(v_state\.voting_round,p_actor\);\s+perform settle_spy_results\(v_state\.voting_round,p_actor\);/);
  assert.match(migration, /source_key text not null unique/);
});

test('spy score remains unavailable to public and guest views until results are visible', () => {
  const publicQuery = publicData.indexOf("db.from('spy_points_ledger')");
  const publicBoundary = publicData.lastIndexOf('if (game.results_visible)', publicQuery);
  assert.ok(publicBoundary >= 0 && publicBoundary < publicQuery);
  const guestQuery = guestData.indexOf("db.from('spy_points_ledger')");
  const guestBoundary = guestData.lastIndexOf('if (game.results_visible)', guestQuery);
  assert.ok(guestBoundary >= 0 && guestBoundary < guestQuery);
  assert.match(scoreboard, /data\.resultsVisible && \(data\.spyScores \?\? \[\]\)\.length/);
  assert.doesNotMatch(publicData.slice(0, publicData.indexOf('if (game.results_visible)')), /spy_points_ledger/);
});

test('admin dashboard uses an explicit spy ledger DTO and never selects all fields', () => {
  assert.match(adminData, /from\('spy_points_ledger'\)\.select\('id,guest_id,amount,reason,note,actor,voting_round,created_at,guest:guests\(id,name,team\)'\)/);
  assert.doesNotMatch(adminData, /from\('spy_points_ledger'\)\.select\('\*'\)/);
});
