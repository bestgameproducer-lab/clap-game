import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/202607310026_finalize_unmatched_symbol_players.sql', import.meta.url), 'utf8');
const adminData = readFileSync(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');

test('phase-one finalization preserves active pairs and auto-matches remaining opposite halves', () => {
  assert.match(migration, /v_paired not in \(0,2,4\)/);
  assert.match(migration, /where symbol=v_symbol and status='AVAILABLE' and fragment_side='LEFT'/);
  assert.match(migration, /where symbol=v_symbol and status='AVAILABLE' and fragment_side='RIGHT'/);
  assert.match(migration, /status='ACTIVE',activated_at=now\(\)/);
  assert.match(migration, /'mission_points_awarded',false/);
  assert.doesNotMatch(migration, /complete_system_mission\([^;]+system:phase-one-auto-match/);
  assert.match(migration, /status='UNPAIRED_FINAL'/);
});

test('phase-one finalization rejects only unresolved invitations before fallback matching', () => {
  assert.match(migration, /relationship_type=v_relationship_type and r\.status='PENDING'/);
  assert.match(migration, /set status='REJECTED'/);
  assert.match(migration, /'existing_active_pairs_preserved',true/);
  assert.doesNotMatch(migration, /delete from player_relationships/);
});

test('phase-two transition errors are translated into actionable admin messages', () => {
  for (const code of [
    'phase_two_roster_not_ready',
    'phase_two_trickster_count_invalid',
    'phase_two_relationship_roles_not_ready',
    'phase_two_yirui_speech_unavailable',
    'phase_two_coverage_invalid',
    'DELETE requires a WHERE clause',
  ]) assert.match(adminData, new RegExp(code));
});
