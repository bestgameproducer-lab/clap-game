import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290017_spy_clue_pools.sql', import.meta.url);

test('clues can be bound to a real spy and tiered from one to three', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /spy_guest_id uuid references guests\(id\) on delete set null/);
  assert.match(migration, /level integer not null default 1/);
  assert.match(migration, /level between 1 and 3/);
  assert.match(migration, /message='clue_target_not_spy'/);
  assert.match(migration, /message='clue_spy_still_referenced'/);
});

test('a granted clue keeps its target spy and level immutable', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const saveFunction = migration.slice(migration.indexOf('create function save_game_clue'), migration.indexOf('create or replace function approve_assignment'));
  assert.match(saveFunction, /exists\(select 1 from guest_clues where clue_id=p_clue_id\)/);
  assert.match(saveFunction, /v_existing\.spy_guest_id is distinct from p_spy_guest_id/);
  assert.match(saveFunction, /v_existing\.level<>p_level/);
  assert.match(saveFunction, /message='clue_rules_locked'/);
  assert.match(saveFunction, /'clue\.save'/);
});

test('automatic early rewards prefer a relevant same-team spy clue', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const approval = migration.slice(migration.indexOf('create or replace function approve_assignment'));
  assert.match(approval, /spy\.id=c\.spy_guest_id and spy\.team=v_team and spy\.role='spy'/);
  assert.match(approval, /v_role<>'spy'/);
  assert.match(approval, /case when c\.spy_guest_id is not null then 0 else 1 end,c\.level/);
});

test('private clue targeting metadata stays out of guest, station, and public DTOs', async () => {
  const [guestData, stationData, publicData] = await Promise.all([
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
  ]);
  for (const source of [guestData, stationData, publicData]) {
    assert.equal(source.includes('spy_guest_id'), false);
    assert.equal(source.includes('clues_spy_guest_id_fkey'), false);
  }
});

test('admin clue saves validate target and level server-side', async () => {
  const route = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
  const page = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  assert.match(route, /spyGuestId: body\.spyGuestId \? requiredUuid\(body\.spyGuestId, '对应间谍'\) : null/);
  assert.match(route, /level: requiredInteger\(body\.level, '线索等级', 1, 3\)/);
  assert.match(page, /每位间谍已有专属线索/);
  assert.match(page, /一级 · 模糊/);
  assert.match(page, /三级 · 接近答案/);
});
