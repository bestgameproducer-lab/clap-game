import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/202608010003_restore_fixed_ceremony_cast.sql', import.meta.url), 'utf8');

test('fixed ceremony cast is restored only before cards are drawn', () => {
  assert.match(migration, /drawn_at is null and lower\(login_name\)='yifan yu'/);
  assert.match(migration, /story_role='OFFICIANT'/);
  assert.match(migration, /drawn_at is null and lower\(login_name\)='siran li'/);
  assert.match(migration, /story_role='GROOM_CHEERLEADER'/);
  assert.match(migration, /drawn_at is null and lower\(login_name\)='moshuang xu'/);
  assert.match(migration, /story_role='BRIDE_CHEERLEADER'/);
  assert.match(migration, /eligible_for_secret_role=false/);
  assert.doesNotMatch(migration, /delete from assignments|delete from points_ledger|truncate/i);
});

test('ordinary profile selection cannot unlock fixed story roles or lucky stars', () => {
  const configure = migration.slice(migration.indexOf('create or replace function configure_guest_game_profile'));
  assert.match(configure, /fixed_story_role_conflict/);
  assert.match(configure, /role_locked=\(p_role='spy' or v_guest\.story_role<>'NONE' or not v_guest\.eligible_for_secret_role\)/);
  assert.match(migration, /lower\(login_name\) in\('feifei xie','luyi sun'\)/);
});
