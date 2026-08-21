import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixUrl = new URL(
  '../supabase/migrations/202608210005_no_unmatched_symbol_pair_points.sql',
  import.meta.url,
);
const autoPairUrl = new URL(
  '../supabase/migrations/202608130034_complete_auto_paired_symbol_missions.sql',
  import.meta.url,
);

test('phase-one fallback scores completed pairs but not the final unmatched holders', async () => {
  const [fix, autoPair] = await Promise.all([
    readFile(fixUrl, 'utf8'),
    readFile(autoPairUrl, 'utf8'),
  ]);

  assert.match(autoPair, /perform complete_system_mission\(v_a,v_mechanic/);
  assert.match(autoPair, /perform complete_system_mission\(v_b,v_mechanic/);

  assert.match(fix, /position\('perform complete_system_mission\(v_last,v_mechanic'/);
  assert.match(fix, /status='cancelled'/);
  assert.match(fix, /a\.guest_id=v_last and a\.task_id=t\.id and a\.is_initial/);
  assert.match(fix, /'unmatched-symbol-live-reversal:'\|\|a\.id::text/);
  assert.match(fix, /update guests g set points=greatest\(0,g\.points\+totals\.amount\)/);
  assert.match(fix, /'phase_one_pairing_completed',false,'phase_one_points_awarded',0/);
  assert.match(fix, /'unpaired_final_players_receive_zero_points',true/);
  assert.match(fix, /'unpaired_act_two_roles_preserved',true/);
});

test('the production-data correction is exact, audited, and idempotent', async () => {
  const fix = await readFile(fixUrl, 'utf8');

  assert.match(fix, /s\.status='UNPAIRED_FINAL'/);
  assert.match(fix, /p\.actor='system:phase-one-finalize'/);
  assert.match(fix, /p\.reason='第一阶段结束：最后一位图案玩家自动完成任务'/);
  assert.match(fix, /'unmatched-symbol-score-reversal:'\|\|v_row\.assignment_id::text/);
  assert.match(fix, /insert into points_ledger\([\s\S]*-v_row\.amount/);
  assert.match(fix, /update guests set points=greatest\(0,points-v_row\.amount\)/);
  assert.match(fix, /phase_one_points_snapshot=greatest\([\s\S]*phase_one_points_snapshot-v_row\.amount/);
  assert.match(fix, /'symbol\.unpaired_score_corrected'/);
  assert.doesNotMatch(fix, /delete from points_ledger/);
  assert.doesNotMatch(fix, /update game_state set stage/);
});
