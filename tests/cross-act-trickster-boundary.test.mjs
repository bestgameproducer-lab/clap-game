import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('phase-one finalization preserves only the exact official trickster signal assignment', async () => {
  const migration = await read('supabase/migrations/202608130014_preserve_cross_act_trickster_signal.sql');

  assert.match(migration, /t\.stage='task_round_1'/);
  assert.match(migration, /t\.category<>'ceremony'/);
  assert.match(migration, /and not \([\s\S]*?t\.mission_code='P1-TRICKSTER-001'/);
  assert.match(migration, /t\.formal_allowed and t\.active and t\.category='hidden'/);
  assert.match(migration, /t\.mechanic='TRICKSTER_SIGNAL'/);
  assert.match(migration, /g\.active and g\.uses_app[\s\S]*?g\.participation_mode='ACTIVE_PLAYER'/);
  assert.match(migration, /g\.drawn_at is not null and g\.role='spy'/);
  assert.match(migration, /and a\.status in\('assigned','rejected'\)/);
  assert.doesNotMatch(migration, /title\s*=\s*'寻找恶作剧者同伴'/);
});

test('cross-act patch accepts the canonical predecessor already modified by the August 2 migration', async () => {
  const [migration, predecessor] = await Promise.all([
    read('supabase/migrations/202608130014_preserve_cross_act_trickster_signal.sql'),
    read('supabase/migrations/202608020001_fix_clue_and_final_score_consistency.sql'),
  ]);

  const predecessorPredicate = "and a.status in('assigned','rejected') and t.mission_code<>'P1-TRICKSTER-001';";
  assert.match(predecessor, /and a\.status in\(''assigned'',''rejected''\) and t\.mission_code<>''P1-TRICKSTER-001'';/);
  assert.ok(migration.includes(predecessorPredicate), 'forward patch must recognize the canonical predecessor definition');
  assert.match(migration, /v_updated:=replace\([\s\S]*?v_updated,[\s\S]*?and a\.status in\('assigned','rejected'\);/);
});

test('cross-act repair cannot revive operator cancellations or published results', async () => {
  const migration = await read('supabase/migrations/202608130014_preserve_cross_act_trickster_signal.sql');

  assert.match(migration, /a\.status='cancelled' and a\.rejection_reason is null/);
  assert.match(migration, /a\.replaced_by_assignment_id is null/);
  assert.match(migration, /l\.action='assignment\.reassign'/);
  assert.match(migration, /l\.details->>'previous_assignment_id'=a\.id::text/);
  assert.match(migration, /assignment\.operator_reassignment_recancelled/);
  assert.match(migration, /s\.stage in\('task_round_2','banquet','group_game'\)/);
  assert.match(migration, /s\.results_published_at is null/);
  assert.match(migration, /not exists\(select 1 from result_rewards\)/);
  assert.match(migration, /operator_cancellations_preserved',true/);
});

test('system completion cannot resurrect any cancelled or obsolete assignment', async () => {
  const migration = await read('supabase/migrations/202608130014_preserve_cross_act_trickster_signal.sql');
  const replacement = migration.match(/\$new\$and t\.mechanic=p_mechanic([\s\S]*?)\$new\$/)?.[1] ?? '';

  assert.match(migration, /complete_system_mission_before_final_lock\(uuid,text,text,text\)/);
  assert.match(replacement, /a\.status in\('assigned','rejected','submitted'\)/);
  assert.doesNotMatch(replacement, /a\.status<>'approved'/);
});

test('guest runtime keeps the official trickster signal actionable except during the ceremony pause', async () => {
  const [rules, guestData, guestPage, boundaryMigration] = await Promise.all([
    read('lib/game-rules.ts'),
    read('lib/data/guest.ts'),
    read('app/guest/page.tsx'),
    read('supabase/migrations/202608130015_lock_team_scoring_and_fix_trickster_window.sql'),
  ]);

  assert.match(rules, /if \(taskStage === 'task_round_1'\) return isPhaseOneInteractionOpenAtStage\(gameStage\)/);
  assert.match(rules, /\['registration', 'waiting', 'ceremony_end', 'task_round_2', 'banquet', 'group_game'\]/);
  assert.match(guestData, /\.neq\('status', 'cancelled'\)/);
  assert.match(guestPage, /canUseTricksterSignal = data\.guest\.role === 'spy' && isPhaseOneInteractionOpenAtStage\(data\.game\?\.stage\)/);
  assert.match(boundaryMigration, /request_player_connection_before_final_lock/);
  assert.match(boundaryMigration, /accept_player_connection_before_final_lock/);
  assert.match(boundaryMigration, /not phase_one_interactions_open\(v_stage\)/);
});
