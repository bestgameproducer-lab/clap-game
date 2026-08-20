import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [historicalMigration, currentRules] = await Promise.all([
  readFile(new URL('../supabase/migrations/202608010003_restore_fixed_ceremony_cast.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202608200002_bouquet_lucky_and_double_verdict.sql', import.meta.url), 'utf8'),
]);

test('historical fixed ceremony cast migration remains auditable', () => {
  assert.match(historicalMigration, /drawn_at is null and lower\(login_name\)='yifan yu'/);
  assert.match(historicalMigration, /story_role='OFFICIANT'/);
  assert.match(historicalMigration, /eligible_for_secret_role=false/);
  assert.doesNotMatch(historicalMigration, /delete from assignments|delete from points_ledger|truncate/i);
});

test('ordinary profile selection cannot unlock current fixed story roles or lucky stars', () => {
  const configure = historicalMigration.slice(historicalMigration.indexOf('create or replace function configure_guest_game_profile'));
  assert.match(configure, /fixed_story_role_conflict/);
  assert.match(configure, /role_locked=\(p_role='spy' or v_guest\.story_role<>'NONE' or not v_guest\.eligible_for_secret_role\)/);
  assert.match(historicalMigration, /lower\(login_name\) in\('feifei xie','luyi sun'\)/);
});

test('current cast retires both cheerleader roles and returns Siran and Moshuang to random play', () => {
  assert.match(currentRules, /where mission_code in\('P1-CER-003','P1-CER-004'\)/);
  assert.match(currentRules, /where lower\(regexp_replace\(trim\(login_name\),'\\s\+',' ','g'\)\) in\('siran li','moshuang xu'\)/);
  assert.match(currentRules, /story_role='NONE'[\s\S]*role_locked=false[\s\S]*eligible_for_secret_role=true/);
  const currentRoster = currentRules.slice(
    currentRules.indexOf('create or replace function formal_wedding_roster_ready'),
    currentRules.indexOf('create or replace function configure_guest_story_role_before_final_lock'),
  );
  assert.doesNotMatch(currentRoster, /GROOM_CHEERLEADER|BRIDE_CHEERLEADER/);
});
