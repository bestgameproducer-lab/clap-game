import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the latest approval definition preserves zero-point trickster facades', async () => {
  const migration = await read('supabase/migrations/202608140001_restore_trickster_facade_no_score.sql');
  const approval = migration.slice(
    migration.indexOf('create or replace function approve_assignment'),
    migration.indexOf('revoke all on function approve_assignment'),
  );

  assert.match(approval, /select points,role into v_total,v_guest_role/);
  assert.match(approval, /v_score_policy='NO_PERSONAL'[\s\S]*v_task_stage='task_round_1' and v_guest_role='spy'[\s\S]*then 0/);
  assert.match(approval, /if v_assignment\.is_initial and v_points>0 then/);
  assert.match(approval, /trickster_facade_no_score/);
  assert.doesNotMatch(approval, /insert into guest_clues|reward_clue_id\s*=\s*[^n]/);
  assert.match(migration, /existing_runtime_rows_untouched',true/);
});

test('every staff and mutual-confirmation completion path still converges on the fixed approval function', async () => {
  const [staff, confirmation, verification] = await Promise.all([
    read('supabase/migrations/202607290022_assignment_verification_records.sql'),
    read('supabase/migrations/202608080001_restore_new_friend_confirmation_boundary.sql'),
    read('supabase/migrations/202608130024_scope_staff_runtime_mutations_to_rehearsal.sql'),
  ]);

  assert.match(staff, /return approve_assignment_with_verification\(p_assignment_id,p_actor,trim\(p_reason\)\)/);
  assert.match(confirmation, /perform approve_assignment\(v_confirmation\.assignment_id,'system:mutual-confirmation'/);
  assert.match(verification, /return approve_assignment_with_verification\(/);
});
