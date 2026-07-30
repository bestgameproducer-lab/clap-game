import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290041_final_roster_participation.sql', import.meta.url);

test('all 32 final guests remain app-login eligible while runtime rehearsal data is cleared', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /insert into final_wedding_roster_v1 values/);
  assert.equal((migration.match(/^\('/gm) ?? []).length, 32);
  assert.match(migration, /uses_app=true/);
  assert.match(migration, /where g\.active and g\.uses_app/);
  assert.match(migration, /where active and uses_app and lower/);
  assert.match(migration, /delete from assignments/);
  assert.match(migration, /claim_code_hash=null,claimed_at=null,drawn_at=null/);
});

test('honor guests draw a dedicated family surprise instead of a random task', async () => {
  const [migration, surpriseMigration, guestPage, guestData] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../supabase/migrations/202607290042_honor_surprise_copy.sql', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /'HONOR_GUEST'/);
  assert.match(migration, /'PRINCIPAL'/);
  assert.match(surpriseMigration, /你已经完成了最重要的任务：一路陪伴新郎长大/);
  assert.match(migration, /guest_not_mission_eligible/);
  assert.match(guestPage, /data\.guest\.participation_mode === 'HONOR_GUEST'/);
  assert.match(guestPage, /data\.guest\.special_card_title/);
  assert.match(guestPage, /revealSpecialCard/);
  assert.match(guestPage, /抽取我的惊喜卡/);
  assert.match(guestPage, /specialCardRevealed \? 'revealed'/);
  assert.match(guestData, /participation_mode !== 'ACTIVE_PLAYER'/);
});

test('fixed ceremony players draw their assigned story task and never enter the trickster pool', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /'OFFICIANT'/);
  assert.match(migration, /'RING_KEEPER'/);
  assert.match(migration, /if not v_guest\.eligible_for_secret_role then\s+v_role:='guest'/);
  assert.match(migration, /where active and story_role_scope=v_guest\.story_role/);
  assert.match(migration, /assignments_guest_eligibility_guard/);
  assert.match(migration, /story_task_guest_mismatch/);
  assert.match(migration, /points_ledger_guest_eligibility_guard/);
  assert.match(migration, /'Andao Chen'.*'RING_KEEPER'/);
  assert.match(migration, /'Yifan Yu'.*'OFFICIANT'/);
  assert.match(migration, /'Xingcheng Jin'.*'RING_KEEPER'/);
});
