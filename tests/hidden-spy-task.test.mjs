import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290019_hidden_spy_task.sql', import.meta.url);
const retirementMigrationUrl = new URL('../supabase/migrations/202608130011_lock_final_results_and_retire_hidden_spy.sql', import.meta.url);

test('historical migration constrained the retired hidden-spy task and activated guest', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /add column if not exists grants_hidden_spy boolean not null default false/);
  assert.match(migration, /add column if not exists is_hidden_spy boolean not null default false/);
  assert.match(migration, /not grants_hidden_spy or \(category='hidden' and role_scope='guest' and stage='task_round_2'\)/);
  assert.match(migration, /unique index if not exists tasks_single_active_hidden_spy_idx/);
  assert.match(migration, /unique index if not exists guests_single_hidden_spy_idx/);
});

test('historical hidden-spy assignment was reserved for one drawn ordinary guest', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const assign = migration.slice(migration.indexOf('create or replace function assign_task_to_guest'), migration.indexOf('create or replace function approve_assignment'));
  assert.match(assign, /pg_advisory_xact_lock\(hashtext\('wedding-hidden-spy-activation-v1'\)\)/);
  assert.match(assign, /v_guest\.drawn_at is null or v_guest\.role<>'guest' or v_guest\.is_hidden_spy/);
  assert.match(assign, /message='hidden_spy_already_activated'/);
  assert.match(assign, /message='hidden_spy_task_already_assigned'/);
  assert.match(assign, /'assignment\.create'/);
});

test('historical approval promoted the hidden spy in one transaction', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const approval = migration.slice(migration.indexOf('create or replace function approve_assignment'));
  const eligibility = approval.indexOf("if v_role<>'guest'");
  const ledger = approval.indexOf('insert into points_ledger');
  const promotion = approval.indexOf("role=case when v_grants_hidden_spy then 'spy'");
  assert.ok(eligibility > 0 && ledger > eligibility && promotion > ledger);
  assert.match(approval, /is_hidden_spy=case when v_grants_hidden_spy then true/);
  assert.match(approval, /'hidden_spy_activated',v_grants_hidden_spy/);
  assert.match(approval, /spy\.id=c\.spy_guest_id and spy\.team=v_team and spy\.role='spy'/);
});

test('current runtime permanently retires hidden-spy tasks from API, data, and UI', async () => {
  const [retirement, route, data, page, hostPage] = await Promise.all([
    readFile(retirementMigrationUrl, 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(retirement, /update tasks set active=false where grants_hidden_spy and active/);
  assert.match(retirement, /if new\.grants_hidden_spy then[\s\S]*message='hidden_spy_feature_retired'/);
  assert.doesNotMatch(route, /grantsHiddenSpy|issueHiddenTaskCode|redeemHiddenTaskCode/);
  assert.match(data, /p_grants_hidden_spy: false/);
  assert.match(data, /from\('tasks'\)\.select\('[^']*grants_hidden_spy[^']*'\)\.eq\('grants_hidden_spy', false\)/);
  assert.doesNotMatch(page, /完成后成为隐藏间谍|隐藏任务实体卡|issueHiddenTaskCode/);
  assert.doesNotMatch(page, /隐藏间谍/);
  assert.doesNotMatch(hostPage, /隐藏间谍/);
});

test('approved historical hidden-spy identity remains private until the results boundary', async () => {
  const [guestSource, publicSource, stationSource] = await Promise.all([
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(guestSource, /select\('id,name,team,role,is_hidden_spy,points,active,uses_app,drawn_at/);
  assert.equal(guestSource.includes('hidden_role'), false);
  const resultsGuard = publicSource.indexOf('if (game.results_visible)');
  const publicHiddenSpyQuery = publicSource.indexOf("select('id,name,team,role,is_hidden_spy')");
  assert.ok(resultsGuard >= 0 && publicHiddenSpyQuery > resultsGuard);
  assert.equal(stationSource.includes('is_hidden_spy'), false);
});
