import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/202608130023_scope_guest_mutations_to_rehearsal.sql');

test('guest sessions are stamped with the current rehearsal run under the reset lock', () => {
  assert.match(migration, /alter table guest_sessions[\s\S]*add column if not exists rehearsal_run_id uuid/);
  assert.match(migration, /create trigger stamp_guest_session_rehearsal_run[\s\S]*before insert on guest_sessions/);
  assert.match(migration, /stamp_guest_session_rehearsal_run\(\)[\s\S]*pg_advisory_xact_lock_shared\(hashtext\('wedding-rehearsal-reset-v1'\)\)/);
});

test('every guest-facing mutation validates the authenticated run while holding the shared reset lock', () => {
  assert.match(migration, /assert_guest_rehearsal_run[\s\S]*pg_advisory_xact_lock_shared\(hashtext\('wedding-rehearsal-reset-v1'\)\)/);
  assert.match(migration, /v_current_run_id is distinct from p_rehearsal_run_id[\s\S]*guest_rehearsal_run_mismatch/);
  assert.match(migration, /from guest_sessions[\s\S]*rehearsal_run_id=p_rehearsal_run_id[\s\S]*expires_at>now\(\)/);

  const signatures = [
    'consume_player_code_attempt', 'draw_guest_card', 'submit_assignment',
    'cast_team_vote', 'submit_phase_two_dilemma', 'submit_phase_two_copy_choice',
    'reveal_honor_special_card', 'request_player_connection',
    'accept_player_connection', 'reject_player_connection',
    'request_assignment_mutual_confirmation',
    'respond_assignment_mutual_confirmation', 'authorize_guest_avatar_upload',
    'confirm_guest_avatar', 'authorize_guest_assignment_evidence_upload',
    'confirm_assignment_evidence', 'clear_assignment_evidence',
  ];
  for (const name of signatures) {
    const block = migration.match(new RegExp(`create function ${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0];
    assert.ok(block, `missing run-scoped overload for ${name}`);
    assert.match(block, /assert_guest_rehearsal_run\(/, `${name} must assert the run`);
  }
});

test('server mutation routes use server-derived guest run context', () => {
  const auth = read('lib/auth.ts');
  assert.match(auth, /select\('guest_id,rehearsal_run_id'\)/);
  assert.match(auth, /data\.rehearsal_run_id !== game\.rehearsal_run_id/);

  const routes = [
    'draw-card', 'submit-task', 'vote', 'phase-two-action',
    'reveal-special-card', 'guest-connection', 'accept-connection',
    'reject-connection', 'mutual-confirmation', 'guest-avatar', 'task-evidence',
  ];
  for (const route of routes) {
    const source = read(`app/api/${route}/route.ts`);
    assert.match(source, /requireGuestContext/);
    assert.match(source, /rehearsalRunId/);
  }

  for (const source of [read('lib/data/guest.ts'), read('lib/data/avatar.ts'), read('lib/data/evidence.ts')]) {
    assert.match(source, /p_rehearsal_run_id: rehearsalRunId/);
  }
});
