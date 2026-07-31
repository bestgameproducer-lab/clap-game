import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607310020_disable_trickster_scoring.sql', import.meta.url), 'utf8');
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const publicData = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
const guestData = await readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const guestPage = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
const scoreboard = await readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8');

test('forward migration preserves historical trickster score data and disables future manual scoring', () => {
  assert.match(migration, /historical_ledger_preserved',true/);
  assert.match(migration, /message='trickster_scoring_disabled'/);
  assert.match(migration, /revoke all on function record_spy_point_event\(uuid,text,text,uuid,text\)[\s\S]*service_role/);
  assert.doesNotMatch(migration, /delete from spy_points_ledger|truncate[^;]*spy_points_ledger|drop table[^;]*spy_points_ledger/i);
});

test('final reveal completes trickster story cards without creating a separate score', () => {
  const settle = migration.slice(migration.indexOf('create or replace function settle_spy_results'), migration.indexOf('-- The renamed legacy function'));
  assert.match(settle, /mission_code='P2-TRICKSTER-001'/);
  assert.match(settle, /'trickster_scoring','disabled'/);
  assert.doesNotMatch(settle, /spy_points_ledger|points_ledger|team_points_ledger/);
  assert.match(migration, /revoke all on function settle_spy_results_before_phase_two_assignment_v1\(integer,text\)[\s\S]*service_role/);
});

test('application exposes no trickster score mutation, query, export, or display', () => {
  for (const source of [adminData, publicData, guestData, adminRoute, adminPage, guestPage, scoreboard]) {
    assert.doesNotMatch(source, /recordSpyPointEvent|record_spy_point_event|spyPointLedger|spyPoints|spyScores/);
  }
  assert.doesNotMatch(adminData, /from\('spy_points_ledger'\)/);
  assert.doesNotMatch(publicData, /from\('spy_points_ledger'\)/);
  assert.doesNotMatch(guestData, /from\('spy_points_ledger'\)/);
  assert.doesNotMatch(adminPage, /恶作剧者积分台|间谍积分/);
  assert.doesNotMatch(guestPage, /恶作剧积分/);
  assert.doesNotMatch(scoreboard, /间谍分|恶作剧得分/);
});
