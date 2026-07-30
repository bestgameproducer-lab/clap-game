import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202607300005_fix_preset_spy_draw.sql', import.meta.url),
  'utf8',
);
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');

test('preset trickster hidden assignment uses the explicit unique constraint', () => {
  assert.match(migration, /pg_get_functiondef\('public\.draw_guest_card\(uuid\)'::regprocedure\)/);
  assert.match(
    migration,
    /on conflict on constraint assignments_guest_id_task_id_key do nothing/,
  );
  assert.match(migration, /draw_guest_card_conflict_clause_not_found/);
});

test('admin preset rejects a second initial trickster in the same team', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('wedding-secret-card-draw-v2'\)\)/);
  assert.match(migration, /g\.team = trim\(p_team\)/);
  assert.match(migration, /g\.role = 'spy'/);
  assert.match(migration, /g\.drawn_at is not null or g\.role_locked/);
  assert.match(migration, /message = 'preset_spy_team_conflict'/);
  assert.match(adminData, /preset_spy_team_conflict/);
  assert.match(adminData, /这个组已经预设了一位恶作剧者/);
});
