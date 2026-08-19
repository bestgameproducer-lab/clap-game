import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/202608190001_retire_joint_family_guests.sql', import.meta.url),
  'utf8',
);

test('joint family retirement deactivates access without deleting wedding history', () => {
  assert.match(migration, /'tianran chen','ziyou chen','tianran chen & ziyou chen'/);
  assert.match(migration, /set active=false,[\s\S]*uses_app=false/);
  assert.match(migration, /delete from guest_sessions/);
  assert.match(migration, /a\.status in\('assigned','submitted','rejected'\)/);
  assert.match(migration, /approved_history_preserved',true/);
  assert.match(migration, /points_preserved',true/);
  assert.doesNotMatch(migration, /delete from guests|delete from assignments|delete from points_ledger/);
});

test('retirement updates all server-authoritative catalog and roster gates', () => {
  assert.match(migration, /set active=false,formal_allowed=false/);
  assert.match(migration, /\(select count\(\*\) from expected\)=22/);
  assert.match(migration, /\(select count\(\*\) from expected\)=32/);
  assert.match(migration, /\(select count\(\*\) from guests where active\)=32/);
  assert.match(migration, /formal_wedding_catalog_ready\(\)/);
  assert.match(migration, /formal_wedding_roster_ready\(\)/);
});
