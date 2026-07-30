import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290019_hidden_spy_task.sql', import.meta.url);

test('database permits only one valid active hidden-spy task and one activated guest', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /add column if not exists grants_hidden_spy boolean not null default false/);
  assert.match(migration, /add column if not exists is_hidden_spy boolean not null default false/);
  assert.match(migration, /not grants_hidden_spy or \(category='hidden' and role_scope='guest' and stage='task_round_2'\)/);
  assert.match(migration, /unique index if not exists tasks_single_active_hidden_spy_idx/);
  assert.match(migration, /unique index if not exists guests_single_hidden_spy_idx/);
});

test('hidden-spy assignment is reserved for one drawn ordinary guest', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const assign = migration.slice(migration.indexOf('create or replace function assign_task_to_guest'), migration.indexOf('create or replace function approve_assignment'));
  assert.match(assign, /pg_advisory_xact_lock\(hashtext\('wedding-hidden-spy-activation-v1'\)\)/);
  assert.match(assign, /v_guest\.drawn_at is null or v_guest\.role<>'guest' or v_guest\.is_hidden_spy/);
  assert.match(assign, /message='hidden_spy_already_activated'/);
  assert.match(assign, /message='hidden_spy_task_already_assigned'/);
  assert.match(assign, /'assignment\.create'/);
});

test('approval awards points and promotes the hidden spy in one transaction', async () => {
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

test('task API validates the flag and locks it after assignment', async () => {
  const [migration, route, data, page] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
  ]);
  const save = migration.slice(migration.indexOf('create function save_game_task'), migration.indexOf('create or replace function assign_task_to_guest'));
  assert.match(save, /v_existing\.grants_hidden_spy is distinct from p_grants_hidden_spy/);
  assert.match(route, /requiredBoolean\(body\.grantsHiddenSpy, '隐藏间谍奖励'\)/);
  assert.match(data, /p_grants_hidden_spy: input\.grantsHiddenSpy/);
  assert.match(page, /完成后成为隐藏间谍/);
  assert.match(page, /const category = grantsHiddenSpy \? 'hidden' : newTask\.category/);
  assert.match(page, /const roleScope = grantsHiddenSpy \? 'guest' : newTask\.roleScope/);
  assert.match(page, /grantsHiddenSpy \? \{ stage: 'task_round_2' \} : \{\}/);
  assert.match(page, /recommendedTaskPoints\(category, roleScope, grantsHiddenSpy\)/);
});

test('hidden-spy identity is private until the established results boundary', async () => {
  const [guestSource, publicSource, stationSource] = await Promise.all([
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(guestSource, /select\('id,name,team,role,is_hidden_spy,points,drawn_at,participation_mode,[^']+'\)/);
  const resultsGuard = publicSource.indexOf('if (game.results_visible)');
  const publicHiddenSpyQuery = publicSource.indexOf("select('id,name,team,role,is_hidden_spy')");
  assert.ok(resultsGuard >= 0 && publicHiddenSpyQuery > resultsGuard);
  assert.equal(stationSource.includes('is_hidden_spy'), false);
});
