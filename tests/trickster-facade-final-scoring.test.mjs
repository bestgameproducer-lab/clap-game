import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the latest rule restores ordinary facade points but excludes them from final placement', async () => {
  const [migration, core, scoreboard] = await Promise.all([
    read('supabase/migrations/202608200001_trickster_camouflage_and_lonely_cupid_steal.sql'),
    read('lib/scoreboard-core.ts'),
    read('app/scoreboard/page.tsx'),
  ]);

  assert.match(migration, /v_points:=case when v_score_policy='NO_PERSONAL' then 0 else v_task_points end/);
  assert.doesNotMatch(migration, /v_task_stage='task_round_1' and v_guest_role='spy'\) then 0/);
  assert.match(migration, /p_actor not like 'system:%'/);
  assert.match(migration, /not \(v_task_stage='task_round_1' and v_guest_role='spy'\)/);
  assert.match(migration, /'trickster_facade_visible_points',2/);
  assert.match(migration, /'trickster_facade_early_honor_eligible',false/);
  assert.match(core, /tricksterGuestIds/);
  assert.match(core, /rankingBucket\(a\.id\) - rankingBucket\(b\.id\)/);
  assert.match(scoreboard, /成功逃脱者置顶，被识破者置底，两者均不显示积分/);
  assert.match(scoreboard, /tricksterResult \? '终局按身份结果结算'/);
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
