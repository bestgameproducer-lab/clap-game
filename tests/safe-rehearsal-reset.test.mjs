import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607290028_safe_rehearsal_reset.sql', import.meta.url), 'utf8');
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

function resetFunction() {
  return migration.slice(migration.indexOf('create or replace function reset_rehearsal_data'));
}

test('rehearsal reset requires backup, exact phrase, reason, and closed public controls', () => {
  const reset = resetFunction();
  assert.match(reset, /p_confirmation<>'RESET WEDDING'/);
  assert.match(reset, /not coalesce\(p_backup_confirmed,false\)/);
  assert.match(reset, /char_length\(trim\(coalesce\(p_reason,''\)\)\) not between 3 and 300/);
  assert.match(reset, /v_state\.registration_open or v_state\.voting_open or v_state\.scoreboard_visible/);
  assert.match(reset, /pg_advisory_xact_lock\(hashtext\('wedding-rehearsal-reset-v1'\)\)/);
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
  for (const table of ['result_rewards', 'votes', 'guest_clues', 'points_ledger', 'team_points_ledger', 'spy_points_ledger', 'team_resource_ledger', 'assignments', 'guest_sessions', 'guest_login_throttles']) {
    assert.match(reset, new RegExp(`delete from ${table}`));
  }
  for (const preserved of ['tasks', 'clues', 'host_segments', 'audit_log', 'admin_sessions', 'hidden_task_codes']) {
    assert.doesNotMatch(reset, new RegExp(`delete from ${preserved}`));
  }
  assert.match(reset, /update hidden_task_codes set claimed_by=null,claimed_at=null,assignment_id=null/);
  assert.match(reset, /team=case when team_locked then team else '未分组' end/);
  assert.match(reset, /role=case when is_hidden_spy then 'guest' when role_locked then role else 'guest' end/);
  assert.match(reset, /update team_resources set balance=10/);
});

test('reset preview excludes credentials and session material', () => {
  const preview = migration.slice(migration.indexOf('create or replace function preview_rehearsal_reset'), migration.indexOf('create or replace function reset_rehearsal_data'));
  for (const secret of ['claim_code_hash', 'token_hash', 'invitation_code_hash', 'password', 'code_hash']) {
    assert.equal(preview.includes(secret), false);
  }
  assert.match(preview, /'evidence_files'/);
  assert.match(preview, /'registration_open'/);
});

test('admin mutation is authenticated, same-origin, and validates every destructive acknowledgement', () => {
  assert.match(adminRoute, /assertSameOrigin\(request\)/);
  assert.match(adminRoute, /requireAdmin\(\)/);
  assert.match(adminRoute, /type === 'resetRehearsal'/);
  assert.match(adminRoute, /requiredBoolean\(body\.backupConfirmed, '备份确认'\)/);
  assert.match(adminRoute, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.match(adminRoute, /requiredString\(body\.reason, '清场原因', 300\)/);
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
  assert.match(adminPage, /window\.confirm\('最后确认：这会退出全部宾客/);
  assert.match(adminPage, /resetControlsClosed/);
  assert.match(adminPage, /重试照片清理/);
});
