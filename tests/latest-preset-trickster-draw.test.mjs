import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202607310021_fix_latest_preset_trickster_draw.sql', import.meta.url),
  'utf8',
);
const latestDraw = await readFile(
  new URL('../supabase/migrations/202607310011_fix_phase_one_team_coverage.sql', import.meta.url),
  'utf8',
);

test('the forward patch targets the latest draw regression without rewriting runtime data', () => {
  assert.match(latestDraw, /or v_guest\.role_locked then\s+v_role:='guest'/);
  assert.match(migration, /pg_get_functiondef\('public\.draw_guest_card\(uuid\)'::regprocedure\)/);
  assert.match(migration, /v_guest\.role_locked and v_guest\.role='guest'/);
  assert.match(migration, /elsif v_guest\.role_locked then\s+v_role:=v_guest\.role/);
  assert.doesNotMatch(migration, /update guests|delete from|truncate|drop table/i);
  assert.match(migration, /existing_draws_preserved',true/);
});

test('a reserved preset trickster removes the random trickster slot for teammates', () => {
  assert.match(migration, /v_reserved_spies integer/);
  assert.match(migration, /g\.drawn_at is null and g\.team=v_guest\.team and g\.role_locked and g\.role='spy'/);
  assert.match(migration, /greatest\(0,1-v_drawn_spies-v_reserved_spies\)/);
});

test('preset configuration and card draw share the same transaction lock', () => {
  assert.match(migration, /preset_configuration_lock_patch_target_not_found/);
  assert.match(migration, /hashtext\('wedding-secret-card-draw-v2'\)/);
  assert.match(migration, /hashtext\('wedding-secret-card-draw-v4'\)/);
  assert.match(migration, /configuration_and_draw_lock_aligned',true/);
});
