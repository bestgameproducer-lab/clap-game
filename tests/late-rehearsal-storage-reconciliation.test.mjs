import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/202608130020_reconcile_late_rehearsal_uploads.sql';

function body(source, name, nextName) {
  const start = source.indexOf(`create or replace function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? source.indexOf(`create or replace function ${nextName}`, start) : source.length;
  assert.notEqual(end, -1, `${name} must have a bounded body`);
  return source.slice(start, end);
}

test('late old-run Storage objects are durably merged into cleanup without touching current-run objects', async () => {
  const migration = await read(migrationPath);
  const reconcile = body(migration, 'reconcile_rehearsal_storage_backlog', null);

  assert.match(reconcile, /pg_advisory_xact_lock_shared\(hashtext\('wedding-rehearsal-reset-v1'\)\)/);
  assert.match(reconcile, /o\.bucket_id='task-evidence'[\s\S]*o\.name !~ \('\^\[0-9a-f-\]\{36\}\/'.*rehearsal_run_id.*'\/\[0-9a-f-\]\{36\}\[\.\]jpg\$'\)/);
  assert.match(reconcile, /o\.bucket_id='guest-avatars'[\s\S]*o\.name !~ \('\^\[0-9a-f-\]\{36\}\/'.*rehearsal_run_id.*'\[\.\]jpg\$'\)/);
  assert.match(reconcile, /unnest\(coalesce\(v_reset\.evidence_paths,'\{\}'::text\[\]\)\|\|v_evidence_paths\)/);
  assert.match(reconcile, /unnest\(coalesce\(v_reset\.avatar_paths,'\{\}'::text\[\]\)\|\|v_avatar_paths\)/);
  assert.match(reconcile, /set evidence_paths=v_merged_evidence,avatar_paths=v_merged_avatars/);
  assert.match(reconcile, /update game_state set registration_open=false/);
  assert.match(reconcile, /'rehearsal\.late_storage_reconciled'/);
  assert.match(reconcile, /'current_run_preserved',v_state\.rehearsal_run_id/);
  assert.doesNotMatch(reconcile, /insert into rehearsal_resets/);
  assert.match(reconcile, /'rehearsal\.late_storage_untracked'/);
  assert.match(reconcile, /'untracked_without_reset',true/);
});

test('registration list and claim both fail closed on storage backlog or stale namespaces', async () => {
  const migration = await read(migrationPath);
  const guard = body(migration, 'assert_rehearsal_storage_ready', 'reconcile_rehearsal_storage_backlog');
  assert.ok(
    guard.indexOf("pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'))")
      < guard.indexOf('from game_state where id=1 for share'),
    'registration guard must share-lock reset before reading the current run',
  );
  assert.match(guard, /cardinality\(evidence_paths\)>0 or cardinality\(avatar_paths\)>0/);
  assert.match(guard, /not rehearsal_storage_namespace_clean\(v_run_id\)/);
  assert.match(guard, /message='rehearsal_storage_cleanup_pending'/);

  const listWrapper = migration.slice(
    migration.indexOf('create function registration_guest_list(p_invitation_code text)'),
    migration.indexOf('alter function claim_guest_by_login'),
  );
  const claimWrapper = migration.slice(
    migration.indexOf('create function claim_guest_by_login('),
    migration.indexOf('revoke all on function assert_rehearsal_storage_ready'),
  );
  for (const wrapper of [listWrapper, claimWrapper]) {
    assert.match(wrapper, /perform assert_rehearsal_storage_ready\(\)/);
    assert.ok(wrapper.indexOf('assert_rehearsal_storage_ready()') < wrapper.indexOf('return query'));
  }
  assert.match(migration, /registration_guest_list_before_storage_guard/);
  assert.match(migration, /claim_guest_by_login_before_storage_guard/);
});

test('admin reads reconcile first, expose failures, and block preflight without crashing the dashboard', async () => {
  const [route, admin, page, registration] = await Promise.all([
    read('app/api/admin-data/route.ts'),
    read('lib/data/admin.ts'),
    read('app/admin/page.tsx'),
    read('lib/data/registration.ts'),
  ]);
  assert.match(route, /const actor = await requireAdmin\(\)/);
  assert.match(route, /getAdminDashboardData\(actor\)/);
  assert.match(route, /export async function POST\(request: Request\)/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(page, /fetch\('\/api\/admin-data', \{ method: 'POST', cache: 'no-store' \}\)/);
  assert.match(admin, /export async function getAdminDashboardData\(actor: string\)/);
  assert.ok(
    admin.indexOf("rpc('reconcile_rehearsal_storage_backlog'") < admin.indexOf('const results = await Promise.all'),
    'reconciliation must happen before the dashboard snapshot',
  );
  assert.match(admin, /storageReconciliationFailed = Boolean\(storageReconciliationError \|\| storageReconciliationUntracked\)/);
  assert.match(admin, /storageSafetyBlocked = storageReconciliationFailed \|\| Boolean\(pendingRehearsalCleanup\)/);
  assert.match(admin, /id: 'private-storage-cleanup'[\s\S]*status: 'blocked'/);
  assert.match(page, /data\.storageReconciliationFailed[\s\S]*暂时无法核对私密照片存储/);
  assert.match(registration, /rehearsal_storage_cleanup_pending[\s\S]*彩排私密照片仍在安全清理中/);
});

test('reconciliation and guarded registration RPCs stay server-only', async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /revoke all on function reconcile_rehearsal_storage_backlog\(text\)[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function reconcile_rehearsal_storage_backlog\(text\) to service_role/);
  assert.match(migration, /revoke all on function registration_guest_list\(text\)[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /revoke all on function claim_guest_by_login\(text,text,text,text,timestamptz,text\)[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /revoke all on function registration_guest_list_before_storage_guard\(text\)[\s\S]*service_role/);
  assert.match(migration, /revoke all on function claim_guest_by_login_before_storage_guard\(text,text,text,text,timestamptz,text\)[\s\S]*service_role/);
});
