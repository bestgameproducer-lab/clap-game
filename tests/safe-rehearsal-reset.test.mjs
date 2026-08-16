import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const baseMigration = await readFile(new URL('../supabase/migrations/202607290028_safe_rehearsal_reset.sql', import.meta.url), 'utf8');
const fixMigration = await readFile(new URL('../supabase/migrations/202607300002_fix_rehearsal_reset.sql', import.meta.url), 'utf8');
const safeUpdateMigration = await readFile(new URL('../supabase/migrations/202607300007_fix_reset_safe_update.sql', import.meta.url), 'utf8');
const avatarResetMigration = await readFile(new URL('../supabase/migrations/202608030001_reset_guest_avatars_with_rehearsal.sql', import.meta.url), 'utf8');
const completenessMigration = await readFile(new URL('../supabase/migrations/202608130001_harden_rehearsal_reset_completeness.sql', import.meta.url), 'utf8');
const migration = `${baseMigration}\n${fixMigration}\n${safeUpdateMigration}\n${avatarResetMigration}\n${completenessMigration}`;
const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const adminExport = await readFile(new URL('../lib/data/export.ts', import.meta.url), 'utf8');
const adminExportRoute = await readFile(new URL('../app/api/admin-export/route.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const eventKey = await readFile(new URL('../lib/event-key.ts', import.meta.url), 'utf8');
const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationFiles = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql'));
const completeSchemaHistory = `${schema}\n${(await Promise.all(migrationFiles.map((name) => readFile(new URL(name, migrationDirectory), 'utf8')))).join('\n')}`;

function resetFunction() {
  return migration.slice(migration.lastIndexOf('create or replace function reset_rehearsal_data'));
}

function baseTableColumns(tableName) {
  const definition = schema.match(new RegExp(`create table if not exists\\s+${tableName}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'))?.[1] || '';
  return new Set(definition.split('\n').map((line) => line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1]?.toLowerCase()).filter(Boolean));
}

test('every public application table has an explicit rehearsal-reset classification', () => {
  const createdTables = new Set([...completeSchemaHistory.matchAll(/create table if not exists\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1].toLowerCase()));
  const clearedRuntime = new Set([
    'assignments', 'assignment_mutual_confirmations', 'clues', 'cupid_helper_actions', 'guest_clues', 'hidden_task_codes',
    'guest_login_throttles', 'guest_sessions', 'phase_two_copy_choices', 'phase_two_dilemmas', 'phase_two_profiles',
    'player_code_attempt_throttles', 'player_relationships', 'points_ledger', 'result_rewards', 'spy_points_ledger',
    'symbol_pairing_assignments', 'team_points_ledger', 'team_resource_ledger', 'trickster_signal_attempts', 'votes',
  ]);
  const resetInPlace = new Set(['alliance_clue_fragments', 'awards', 'game_state', 'guests', 'heart_slots', 'team_resources']);
  const preservedConfiguration = new Set([
    'admin_credential_override', 'admin_login_throttles', 'admin_sessions',
    'audit_log', 'host_segments', 'invitation_code_throttles', 'rehearsal_resets', 'tasks',
  ]);
  const classified = new Set([...clearedRuntime, ...resetInPlace, ...preservedConfiguration]);
  assert.deepEqual([...createdTables].filter((table) => !classified.has(table)).sort(), [], 'a new table must be classified before rehearsal reset can ship');

  const storageBuckets = new Set([...completeSchemaHistory.matchAll(/insert into storage\.buckets\([^)]*\)\s*values\('([^']+)'/gi)].map((match) => match[1]));
  const resetStorageBuckets = new Set(['guest-avatars', 'task-evidence']);
  assert.deepEqual([...storageBuckets].filter((bucket) => !resetStorageBuckets.has(bucket)).sort(), [], 'a new Storage bucket must be classified before rehearsal reset can ship');
  for (const bucket of resetStorageBuckets) assert.match(completenessMigration, new RegExp(`bucket_id='${bucket}'`));

  const reset = resetFunction();
  for (const table of clearedRuntime) assert.match(reset, new RegExp(`delete from ${table} where true;`));
  for (const table of preservedConfiguration) assert.doesNotMatch(reset, new RegExp(`delete from ${table}(?:\\s|;)`));
});

test('every guest and game-state column, including the base schema, has an explicit reset policy', () => {
  const guestColumns = new Set([
    ...baseTableColumns('guests'),
    ...[...completeSchemaHistory.matchAll(/alter table guests\s+add column if not exists\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1].toLowerCase()),
  ]);
  const guestRuntime = new Set(['avatar_path', 'avatar_uploaded_at', 'claim_code_hash', 'claimed_at', 'drawn_at', 'hidden_role', 'is_hidden_spy', 'login_code', 'player_code', 'points', 'special_card_revealed_at', 'unlocked_role']);
  const guestConditionalRuntime = new Set(['ceremony_eligible', 'role', 'story_role', 'team']);
  const guestConfiguration = new Set(['active', 'created_at', 'eligible_for_mission', 'eligible_for_personal_score', 'eligible_for_secret_role', 'id', 'is_elder', 'login_name', 'name', 'participation_mode', 'phase_two_eligible', 'relationship', 'role_locked', 'special_card_body', 'special_card_title', 'staff_notes', 'table_label', 'team_locked', 'uses_app']);
  const classifiedGuestColumns = new Set([...guestRuntime, ...guestConditionalRuntime, ...guestConfiguration]);
  assert.deepEqual([...guestColumns].filter((column) => !classifiedGuestColumns.has(column)).sort(), [], 'a new guest column needs an explicit reset policy');

  const gameColumns = new Set([
    ...baseTableColumns('game_state'),
    ...[...completeSchemaHistory.matchAll(/alter table game_state\s+add column if not exists\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1].toLowerCase()),
  ]);
  const gameRuntime = new Set(['current_host_segment_id', 'display_body', 'display_title', 'phase_note', 'phase_one_completed_at', 'public_clue', 'registration_open', 'rehearsal_run_id', 'results_published_at', 'results_visible', 'scoreboard_visible', 'stage', 'team_clues_settled_at', 'team_score_snapshot', 'timer_ends_at', 'updated_at', 'voting_closed_at', 'voting_open', 'voting_opened_at', 'voting_round']);
  const gameConfiguration = new Set(['clue_reward_limit', 'id', 'invitation_code_hash', 'invitation_code_updated_at', 'task_catalog_mode', 'trickster_max_attempts', 'upgrade_reward_limit']);
  const classifiedGameColumns = new Set([...gameRuntime, ...gameConfiguration]);
  assert.deepEqual([...gameColumns].filter((column) => !classifiedGameColumns.has(column)).sort(), [], 'a new game-state column needs an explicit reset policy');

  const reset = resetFunction();
  for (const column of guestRuntime) assert.match(reset, new RegExp(`${column}(?:=| is )`), `guest runtime column ${column} must be reset and post-checked`);
  for (const column of gameRuntime) assert.match(reset, new RegExp(`${column}(?:=| is |<>)`), `game runtime column ${column} must be reset or post-checked`);
});

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
  const lock = reset.indexOf("pg_advisory_xact_lock(hashtext('wedding-rehearsal-reset-v1'))");
  const lookup = reset.indexOf('select * into v_existing from rehearsal_resets where event_key=p_event_key');
  assert.ok(lock >= 0 && lookup > lock, 'the idempotency lookup must happen under the reset lock');
  assert.match(reset, /if found then return v_existing\.summary/);
  assert.match(reset, /insert into rehearsal_resets\(event_key,actor,reason,summary,evidence_paths\)/);
  assert.match(reset, /'rehearsal\.reset'/);
  assert.match(reset, /'backup_confirmed',true/);
});

test('current reset preserves only reusable configuration and deletes all known runtime tables', () => {
  const reset = resetFunction();
  for (const table of ['hidden_task_codes', 'cupid_helper_actions', 'assignment_mutual_confirmations', 'symbol_pairing_assignments', 'player_relationships', 'trickster_signal_attempts', 'phase_two_dilemmas', 'phase_two_copy_choices', 'phase_two_profiles', 'result_rewards', 'votes', 'guest_clues', 'points_ledger', 'team_points_ledger', 'spy_points_ledger', 'team_resource_ledger', 'assignments', 'clues', 'guest_sessions', 'guest_login_throttles', 'player_code_attempt_throttles']) {
    assert.match(reset, new RegExp(`delete from ${table}`));
  }
  for (const preserved of ['tasks', 'host_segments', 'audit_log', 'admin_sessions']) {
    assert.doesNotMatch(reset, new RegExp(`delete from ${preserved}`));
  }
  assert.doesNotMatch(reset, /update hidden_task_codes set claimed_by=null,claimed_at=null,assignment_id=null/);
  assert.match(reset, /team=case when team_locked then team else '未分组' end/);
  assert.match(reset, /role=case when is_hidden_spy then 'guest' when role_locked then role else 'guest' end/);
  assert.match(reset, /special_card_revealed_at=null/);
  assert.match(reset, /hidden_role='NONE'/);
  assert.match(reset, /login_code=null,claim_code_hash=null/);
  assert.match(reset, /phase_one_completed_at=null/);
  assert.match(reset, /team_clues_settled_at=null,team_score_snapshot=null/);
  assert.match(reset, /rehearsal_run_id=gen_random_uuid\(\)/);
  assert.match(reset, /player_code=generate_readable_player_code\(\)/);
  assert.match(reset, /update team_resources set balance=10/);
  assert.match(reset, /message='reset_postcondition_failed'/);
  assert.match(reset, /'database_postconditions_passed',true/);
  assert.match(reset, /exists\(select 1 from cupid_helper_actions\)/);
  assert.match(reset, /hidden_role<>'NONE'/);
  assert.match(reset, /special_card_revealed_at is not null/);
});

test('reset update statements never assign the same column twice', () => {
  const reset = resetFunction();
  for (const table of ['guests', 'game_state']) {
    const update = reset.match(new RegExp(`update ${table} set([\\s\\S]*?)\\n\\s*where`, 'i'))?.[1] || '';
    assert.ok(update, `missing ${table} reset update`);
    const assignedColumns = [...update.matchAll(/(?:^|,)\\s*([a-z_][a-z0-9_]*)\\s*=/gim)].map((match) => match[1].toLowerCase());
    assert.equal(new Set(assignedColumns).size, assignedColumns.length, `${table} reset assigns a column more than once`);
  }
});

test('production safe-update guard accepts every intentional whole-table cleanup', () => {
  const reset = resetFunction();
  for (const table of ['cupid_helper_actions', 'assignment_mutual_confirmations', 'symbol_pairing_assignments', 'player_relationships', 'trickster_signal_attempts', 'phase_two_dilemmas', 'phase_two_copy_choices', 'phase_two_profiles', 'result_rewards', 'votes', 'guest_clues', 'points_ledger', 'team_points_ledger', 'spy_points_ledger', 'team_resource_ledger', 'assignments', 'clues', 'guest_sessions', 'guest_login_throttles', 'player_code_attempt_throttles']) {
    assert.match(reset, new RegExp(`delete from ${table} where true;`));
  }
  for (const table of ['heart_slots', 'team_resources', 'awards', 'guests']) {
    assert.match(reset, new RegExp(`update ${table} set[\\s\\S]*?where true;`));
  }
  const triggerReset = safeUpdateMigration.slice(
    safeUpdateMigration.indexOf('create or replace function reset_final_mission_story_runtime'),
    safeUpdateMigration.indexOf('create or replace function reset_rehearsal_data'),
  );
  assert.match(triggerReset, /delete from player_relationships where true;/);
  assert.match(triggerReset, /delete from trickster_signal_attempts where true;/);
  assert.match(triggerReset, /update heart_slots set guest_id=null,assigned_at=null where true;/);
  assert.match(triggerReset, /update guests set unlocked_role='NONE' where true;/);
});

test('reset preview excludes credentials and session material', () => {
  const previewStart = migration.lastIndexOf('create or replace function preview_rehearsal_reset');
  const preview = migration.slice(previewStart, migration.indexOf('create or replace function reset_rehearsal_data', previewStart));
  for (const secret of ['claim_code_hash', 'token_hash', 'invitation_code_hash', 'password', 'code_hash']) {
    assert.equal(preview.includes(secret), false);
  }
  assert.match(preview, /'evidence_files'/);
  assert.match(preview, /'registration_open'/);
  assert.match(preview, /'results_visible'/);
  assert.match(preview, /'mutual_confirmations'/);
  assert.match(preview, /'clue_library_entries'/);
  assert.match(preview, /'guest_sessions'/);
  assert.match(preview, /'phase_two_dilemmas'/);
  assert.match(preview, /'helper_actions'/);
  assert.match(preview, /'assigned_heart_slots'/);
  assert.match(preview, /'published_awards'/);
  assert.match(preview, /'pending_storage_cleanup_events'/);
});

test('admin reset preview type and total include every numeric database preview field', () => {
  for (const field of [
    'claimed_guests', 'drawn_guests', 'assignments', 'evidence_files', 'avatar_files', 'votes',
    'result_rewards', 'guest_clues', 'clue_library_entries', 'personal_ledger_entries',
    'team_ledger_entries', 'spy_ledger_entries', 'resource_ledger_entries', 'mutual_confirmations',
    'symbol_pairings', 'helper_actions', 'player_relationships', 'trickster_attempts',
    'assigned_heart_slots', 'phase_two_profiles', 'phase_two_dilemmas', 'phase_two_copy_choices',
    'guest_sessions', 'published_awards', 'hidden_task_codes', 'legacy_alliance_clue_fragments',
    'pending_storage_cleanup_events',
  ]) {
    assert.match(adminPage, new RegExp(`\\b${field}\\b`), `${field} must be represented in the admin preview`);
  }
  assert.doesNotMatch(adminPage, /hidden_task_claims/);
});

test('pending private Storage cleanup blocks a second reset and every registration reopening path', () => {
  const reset = resetFunction();
  assert.match(reset, /cardinality\(evidence_paths\)>0 or cardinality\(avatar_paths\)>0/);
  assert.match(reset, /message='rehearsal_storage_cleanup_pending'/);
  assert.doesNotMatch(reset, /storage\.objects where bucket_id in\('task-evidence','guest-avatars'\)/);
  assert.match(completenessMigration, /create or replace function rehearsal_storage_namespace_clean\(p_run_id uuid\)/);
  assert.match(completenessMigration, /when 'guest-avatars'[\s\S]*p_run_id::text/);
  assert.match(completenessMigration, /when 'task-evidence'[\s\S]*p_run_id::text/);
  assert.match(completenessMigration, /create or replace function guard_registration_until_rehearsal_storage_clean\(\)/);
  assert.match(completenessMigration, /guard_registration_until_rehearsal_storage_clean\(\)[\s\S]*?language plpgsql\s+security definer\s+set search_path=public/);
  assert.match(completenessMigration, /if not new\.registration_open then return new; end if/);
  assert.match(completenessMigration, /if tg_op='UPDATE' and coalesce\(old\.registration_open,false\) then return new; end if/);
  assert.match(completenessMigration, /not rehearsal_storage_namespace_clean\(new\.rehearsal_run_id\)/);
  assert.match(completenessMigration, /before insert or update of registration_open on game_state/);
  assert.match(completenessMigration, /revoke all on function guard_registration_until_rehearsal_storage_clean\(\) from public,anon,authenticated/);
  assert.match(adminData, /rehearsal_storage_cleanup_pending/);
  assert.match(adminData, /完成存储清理/);
});

test('evidence confirmation is isolated by rehearsal run and keeps the original void RPC contract', () => {
  assert.match(completenessMigration, /assignments_evidence_path_check/);
  assert.match(completenessMigration, /\^\[0-9a-f-\]\{36\}\/\[0-9a-f-\]\{36\}\/\(evidence\|\[0-9a-f-\]\{36\}\)\[\.\]jpg\$/);
  for (const functionName of ['confirm_assignment_evidence', 'confirm_assignment_evidence_staff']) {
    const start = completenessMigration.indexOf(`create or replace function ${functionName}`);
    const end = completenessMigration.indexOf('$$;', start) + 3;
    const definition = completenessMigration.slice(start, end);
    assert.match(definition, /returns void/);
    assert.match(definition, /rehearsal_run_id/);
    assert.match(definition, /bucket_id='task-evidence'/);
    assert.match(definition, /v_expected_path:=.+v_run_id::text.+p_assignment_id::text/);
    assert.doesNotMatch(definition, /return v_uploaded_at/);
  }
});

test('reset clears both current and legacy clue stores plus the retired physical-card pool', () => {
  const reset = resetFunction();
  assert.match(reset, /delete from clues where true/);
  assert.match(reset, /delete from guest_clues where true/);
  assert.match(reset, /delete from hidden_task_codes where true/);
  assert.match(reset, /update alliance_clue_fragments set[\s\S]*left_fragment=''[\s\S]*right_fragment=''[\s\S]*active=false/);
  assert.match(reset, /exists\(select 1 from alliance_clue_fragments[\s\S]*left_fragment<>''/);
});

test('admin mutation is authenticated, same-origin, and validates every destructive acknowledgement', () => {
  assert.match(adminRoute, /assertSameOrigin\(request\)/);
  assert.match(adminRoute, /requireAdmin\(\)/);
  assert.match(adminRoute, /type === 'resetRehearsal'/);
  assert.match(adminRoute, /requiredBoolean\(body\.backupConfirmed, '备份确认'\)/);
  assert.match(adminRoute, /eventKey: requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.match(adminRoute, /requiredString\(body\.reason, '清场原因', 300\)/);
  assert.match(adminRoute, /type === 'retryRehearsalCleanup'/);
  assert.match(adminRoute, /requiredUuid\(body\.eventKey, '清理事件 ID'\)/);
});

test('mobile reset generates a valid event key without requiring crypto.randomUUID', () => {
  const resetHandler = adminPage.slice(adminPage.indexOf('function resetRehearsal'), adminPage.indexOf('async function rotateInvitationCode'));
  assert.match(resetHandler, /createEventKey\(\)/);
  assert.doesNotMatch(resetHandler, /crypto\.randomUUID/);
  assert.match(eventKey, /typeof source\?\.randomUUID === 'function'/);
  assert.match(eventKey, /typeof source\?\.getRandomValues === 'function'/);
  assert.match(eventKey, /bytes\[6\].*0x40/);
  assert.match(eventKey, /bytes\[8\].*0x80/);
});

test('all private evidence objects are captured after the transactional database reset', () => {
  assert.match(migration, /evidence_paths text\[\] not null default '\{\}'::text\[\]/);
  assert.match(completenessMigration, /array_agg\(name order by name\)[\s\S]*bucket_id='task-evidence'/);
  const rpc = adminData.indexOf("rpc('reset_rehearsal_data_for_run'");
  const query = adminData.indexOf("from('rehearsal_resets').select('evidence_paths,avatar_paths')", rpc);
  const remove = adminData.indexOf("storage.from('task-evidence').remove(batch)", rpc);
  assert.ok(rpc >= 0 && query > rpc && remove > query);
  assert.match(adminData, /update\(\{ evidence_paths: pendingEvidencePaths \}\)/);
  assert.match(adminData, /rehearsal\.evidence_cleanup_pending/);
});

test('rehearsal reset clears avatar links transactionally and retries private object cleanup', () => {
  assert.match(avatarResetMigration, /add column if not exists avatar_paths text\[\] not null default '\{\}'::text\[\]/);
  assert.match(avatarResetMigration, /'avatar_files',\(select count\(\*\) from guests where avatar_path is not null\)/);
  assert.match(completenessMigration, /array_agg\(name order by name\)[\s\S]*bucket_id='guest-avatars'/);
  assert.match(avatarResetMigration, /before insert on rehearsal_resets/);
  assert.match(completenessMigration, /update guests\s+set avatar_path=null,avatar_uploaded_at=null/);
  assert.match(avatarResetMigration, /avatar_uploaded_at is null or avatar_uploaded_at<=v_reset_at/);
  assert.doesNotMatch(avatarResetMigration, /delete from guests|truncate|drop table guests/);
  assert.match(adminData, /select\('evidence_paths,avatar_paths'\)/);
  assert.match(adminData, /storage\.from\('guest-avatars'\)\.remove\(batch\)/);
  assert.match(adminData, /rehearsal\.avatar_cleanup_pending/);
  assert.match(adminData, /update\(\{ avatar_paths: pendingAvatarPaths \}\)/);
  assert.match(adminPage, /result\.evidenceCleanupPending \|\| result\.avatarCleanupPending/);
  assert.match(adminPage, /删除 \$\{removedPhotos\} 张私密照片/);
  assert.match(adminPage, /resetPreview\.avatar_files/);
  assert.match(adminPage, /pendingRehearsalCleanup/);
  assert.match(adminPage, /继续删除剩余私密照片/);
  assert.match(adminPage, /即使刷新或重新登录也不会丢失清理记录/);
});

test('mobile admin UI presents preview, export acknowledgement, typed phrase, and final confirmation', () => {
  assert.match(adminPage, /彩排数据安全清场/);
  assert.match(adminPage, /我已下载上方八类清场前核对记录/);
  assert.match(adminPage, /type=clues/);
  assert.match(adminPage, /type=guest-clues/);
  assert.match(adminPage, /resetForm\.confirmation !== 'RESET WEDDING'/);
  assert.match(adminPage, /pendingResetConfirmation/);
  assert.match(adminPage, /aria-label="最后确认彩排清场"/);
  assert.match(adminPage, /确认清空彩排数据/);
  assert.doesNotMatch(adminPage.slice(adminPage.indexOf('function resetRehearsal'), adminPage.indexOf('async function rotateInvitationCode')), /window\.confirm/);
  assert.match(adminPage, /resetControlsClosed/);
  assert.doesNotMatch(adminPage, /busy \|\| !resetControlsClosed \|\| !resetForm\.backupConfirmed/);
  assert.match(adminPage, /清场时将自动关闭公开入口/);
  assert.match(adminPage, /当前 \{Number\(resetPreview\.clue_library_entries \|\| 0\)\} 条线索库内容不会保留/);
});

test('eight current-product CSV exports are accurately presented as review records rather than a full recovery package', () => {
  assert.match(adminExport, /'clues' \| 'guest-clues'/);
  assert.match(adminExportRoute, /'clues', 'guest-clues'/);
  assert.match(adminExport, /from\('clues'\)/);
  assert.match(adminExport, /from\('guest_clues'\)/);
  assert.match(adminExport, /关联恶作剧者/);
  assert.match(adminExport, /发放来源/);
  assert.match(adminPage, /八类 CSV 用于人工核对，不是可一键恢复的完整备份包/);
  assert.match(adminPage, /不包含照片文件、密码与会话、密封选择/);
  assert.match(adminPage, /八类清场前核对记录/);
  assert.doesNotMatch(adminPage, /八类 CSV 备份/);
});

test('late stale Storage uploads are rediscovered without deleting current-run objects', () => {
  assert.match(adminData, /select\('rehearsal_run_id'\)/);
  assert.match(adminData, /isCurrentRehearsalStoragePath\('task-evidence'/);
  assert.match(adminData, /isCurrentRehearsalStoragePath\('guest-avatars'/);
  assert.match(adminData, /staleEvidencePaths/);
  assert.match(adminData, /staleAvatarPaths/);
  assert.match(adminData, /recordedPendingRehearsalCleanup \?\?/);
  assert.match(adminData, /evidenceVerification\.paths\.filter\(\(path\) => !isCurrentRehearsalStoragePath/);
  assert.match(adminData, /avatarVerification\.paths\.filter\(\(path\) => !isCurrentRehearsalStoragePath/);
});
