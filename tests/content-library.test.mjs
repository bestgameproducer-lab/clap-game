import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('content library mutations are validated, audited, and server-authoritative', async () => {
  const route = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
  assert.match(route, /type === 'saveTask'/);
  assert.match(route, /requiredBoolean\(body\.active, '任务启用状态'\)/);
  assert.match(route, /type === 'saveClue'/);
  assert.match(route, /requiredString\(body\.groupName, '线索分组', 60\)/);
  const migration = await readFile(new URL('../supabase/migrations/202607290014_content_library_management.sql', import.meta.url), 'utf8');
  assert.match(migration, /message='task_rules_locked'/);
  assert.match(migration, /'task\.save'/);
  assert.match(migration, /'clue\.save'/);
  assert.match(migration, /revoke all on function save_game_task[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /revoke all on function save_game_clue[\s\S]+from public, anon, authenticated/);
  const grouping = await readFile(new URL('../supabase/migrations/202607310028_phase_two_finale_clue_polish.sql', import.meta.url), 'utf8');
  assert.match(grouping, /add column if not exists group_name/);
  assert.match(grouping, /save_game_clue_v2/);
});

test('assigned task rules are immutable while wording and active state remain editable', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607290014_content_library_management.sql', import.meta.url), 'utf8');
  const lockStart = migration.indexOf('if exists(select 1 from assignments');
  const updateStart = migration.indexOf('update tasks set');
  assert.ok(lockStart > 0 && updateStart > lockStart);
  const lock = migration.slice(lockStart, updateStart);
  for (const protectedField of ['points', 'role_scope', 'category', 'stage']) assert.match(lock, new RegExp(protectedField));
  assert.doesNotMatch(lock, /title|description|active/);
});

test('admin loads inactive library entries but only offers active content for assignment', async () => {
  const dataSource = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
  const taskQuery = dataSource.slice(dataSource.indexOf("db.from('tasks')"), dataSource.indexOf("db.from('assignments')", dataSource.indexOf("db.from('tasks')")));
  assert.doesNotMatch(taskQuery, /eq\('active', true\)/);
  const page = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /activeCatalogTasks\.map/);
  assert.match(page, /task\.active && task\.story_role_scope === 'NONE' && \(data\.game\?\.task_catalog_mode === 'demo' \? task\.is_demo : !task\.is_demo\)/);
  assert.match(page, /clueGroups\.map/);
  assert.match(page, /任务库管理/);
  assert.match(page, /线索库管理/);
});
