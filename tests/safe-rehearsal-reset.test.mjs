import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const baseMigration = await readFile(new URL('../supabase/migrations/202607290028_safe_rehearsal_reset.sql', import.meta.url), 'utf8');
const fixMigration = await readFile(new URL('../supabase/migrations/202607300002_fix_rehearsal_reset.sql', import.meta.url), 'utf8');
const migration = `${baseMigration}\n${fixMigration}`;
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const eventKey = await readFile(new URL('../lib/event-key.ts', import.meta.url), 'utf8');

function resetFunction() {
  return migration.slice(migration.lastIndexOf('create or replace function reset_rehearsal_data'));
}

test('rehearsal reset requires backup, exact phrase, and reason, then closes public controls atomically', () => {
  const reset = resetFunction();
  assert.match(reset, /p_confirmation<>'RESET WEDDING'/);
  assert.match(reset, /not coalesce\(p_backup_confirmed,false\)/);
  assert.match(reset, /char_length\(trim\(coalesce\(p_reason,''\)\)\) not between 3 and 300/);
  assert.match(reset, /pg_advisory_xact_lock\(hashtext\('wedding-rehearsal-reset-v1'\)\)/);
  assert.match(reset, /select \* into v_state from game_state where id=1 for update/);
  assert.match(reset, /registration_open=false,\s*voting_open=false,\s*scoreboard_visible=false/);
  assert.doesNotMatch(reset, /message='reset_public_controls_open'/);
});

test('reset is retry-idempotent and leaves a permanent audit summary', () => {
  const reset = resetFunction();
  assert.match(migration, /event_key uuid not null unique/);
  assert.match(reset, /select \* into v_existing from rehearsal_resets where event_key=p_event_key/);
  assert.match(reset, /if found then return v_existing\.summary/);
  assert.match(reset, /insert into rehearsal_resets\(event_key,actor,reason,summary,evidence_paths\)/);
  assert.match(reset, /'rehearsal\.reset'/);
  assert.match(reset, /'backup_confirmed',true/);
});

test('runtime progress is cleared while reusable wedding configuration remains', () => {
  const reset = resetFunction();
  for (const table of ['cupid_helper_actions', 'assignment_mutual_confirmations', 'symbol_pairing_assignments', 'player_relationships', 'trickster_signal_attempts', 'result_rewards', 'votes', 'guest_clues', 'points_ledger', 'team_points_ledger', 'spy_points_ledger', 'team_resource_ledger', 'assignments', 'guest_sessions', 'guest_login_throttles']) {
    assert.match(reset, new RegExp(`delete from ${table}`));
  }
  for (const preserved of ['tasks', 'clues', 'host_segments', 'audit_log', 'admin_sessions', 'hidden_task_codes']) {
    assert.doesNotMatch(reset, new RegExp(`delete from ${preserved}`));
  }
  assert.match(reset, /update hidden_task_codes set claimed_by=null,claimed_at=null,assignment_id=null/);
  assert.match(reset, /team=case when team_locked then team else '未分组' end/);
  assert.match(reset, /role=case when is_hidden_spy then 'guest' when role_locked then role else 'guest' end/);
  assert.match(reset, /special_card_revealed_at=null/);
  assert.match(reset, /phase_one_completed_at=null/);
  assert.match(reset, /update team_resources set balance=10/);
});

test('reset preview excludes credentials and session material', () => {
  const previewStart = migration.lastIndexOf('create or replace function preview_rehearsal_reset');
  const preview = migration.slice(previewStart, migration.indexOf('create or replace function reset_rehearsal_data', previewStart));
  for (const secret of ['claim_code_hash', 'token_hash', 'invitation_code_hash', 'password', 'code_hash']) {
    assert.equal(preview.includes(secret), false);
  }
  assert.match(preview, /'evidence_files'/);
  assert.match(preview, /'registration_open'/);
  assert.match(preview, /'mutual_confirmations'/);
});

test('admin mutation is authenticated, same-origin, and validates every destructive acknowledgement', () => {
  assert.match(adminRoute, /assertSameOrigin\(request\)/);
  assert.match(adminRoute, /requireAdmin\(\)/);
  assert.match(adminRoute, /type === 'resetRehearsal'/);
  assert.match(adminRoute, /requiredBoolean\(body\.backupConfirmed, '备份确认'\)/);
  assert.match(adminRoute, /body\.eventKey === undefined \? randomUUID\(\) : requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.match(adminRoute, /requiredString\(body\.reason, '清场原因', 300\)/);
});

test('mobile reset generates a valid event key without requiring crypto.randomUUID', () => {
  const resetHandler = adminPage.slice(adminPage.indexOf('async function resetRehearsal'), adminPage.indexOf('async function rotateInvitationCode'));
  assert.match(resetHandler, /createEventKey\(\)/);
  assert.doesNotMatch(resetHandler, /crypto\.randomUUID/);
  assert.match(eventKey, /typeof source\?\.randomUUID === 'function'/);
  assert.match(eventKey, /typeof source\?\.getRandomValues === 'function'/);
  assert.match(eventKey, /bytes\[6\].*0x40/);
  assert.match(eventKey, /bytes\[8\].*0x80/);
});

test('linked private evidence is removed after the transactional database reset', () => {
  assert.match(migration, /evidence_paths text\[\] not null default '\{\}'::text\[\]/);
  assert.match(migration, /array_agg\(evidence_path order by evidence_path\)/);
  const rpc = adminData.indexOf("rpc('reset_rehearsal_data'");
  const query = adminData.indexOf("from('rehearsal_resets').select('evidence_paths')", rpc);
  const remove = adminData.indexOf("storage.from('task-evidence').remove(batch)", rpc);
  assert.ok(rpc >= 0 && query > rpc && remove > query);
  assert.match(adminData, /update\(\{ evidence_paths: pendingEvidencePaths \}\)/);
  assert.match(adminData, /rehearsal\.evidence_cleanup_pending/);
});

test('mobile admin UI presents preview, export acknowledgement, typed phrase, and final confirmation', () => {
  assert.match(adminPage, /彩排数据安全清场/);
  assert.match(adminPage, /我已下载上方八类 CSV 备份/);
  assert.match(adminPage, /resetForm\.confirmation !== 'RESET WEDDING'/);
  assert.match(adminPage, /window\.confirm\('最后确认：系统会先自动关闭注册、投票和公开大屏/);
  assert.match(adminPage, /resetControlsClosed/);
  assert.doesNotMatch(adminPage, /busy \|\| !resetControlsClosed \|\| !resetForm\.backupConfirmed/);
  assert.match(adminPage, /清场时将自动关闭公开入口/);
  assert.match(adminPage, /重试照片清理/);
});
