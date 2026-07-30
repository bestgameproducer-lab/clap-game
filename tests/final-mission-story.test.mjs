import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290045_final_mission_story.sql', import.meta.url);
const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);
const guestDataUrl = new URL('../lib/data/guest.ts', import.meta.url);
const adminRouteUrl = new URL('../app/api/admin-action/route.ts', import.meta.url);
const connectionRouteUrl = new URL('../app/api/guest-connection/route.ts', import.meta.url);

test('the confirmed phase-one and phase-two mission catalogue replaces draft draws', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  for (const code of [
    'P1-001','P1-002','P1-003','P1-004','P1-005','P1-006','P1-007','P1-008',
    'P2-DECOY-001','P2-DECOY-002','P2-DECOY-003','P2-DECOY-004','P2-DECOY-005','P2-TRICKSTER-001',
  ]) assert.match(migration, new RegExp(`'${code}'`));
  assert.match(migration, /mission_code in\('P1-007','P1-008'\)/);
  assert.match(migration, /update tasks set active=false[\s\S]+stage='task_round_1' and mission_code is null/);
  assert.match(migration, /update game_state set task_catalog_mode='live'/);
});

test('phase-one tricksters receive ordinary tasks but no public personal score', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /v_assignment\.is_initial and v_task_stage='task_round_1' and v_role='spy'/);
  assert.match(migration, /then 0 else v_task_points end/);
  assert.match(migration, /if v_points<>0 then[\s\S]+insert into points_ledger/);
  assert.match(migration, /if v_role<>'spy' and v_rank<=v_upgrade_limit/);
  assert.match(migration, /if v_rank between 1 and 3 and v_role<>'spy' and v_eligible/);
  const guestPage = await readFile(guestPageUrl, 'utf8');
  assert.match(guestPage, /revealedCard\?\.role === 'spy' \? '完成但不计个人分'/);
  assert.match(guestPage, /完成记录 · 不计个人分/);
});

test('heart matching creates two alliances and one configurable lonely cupid', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  for (const slot of ['HEART-A-L','HEART-A-R','HEART-B-L','HEART-B-R','HEART-SOLO']) {
    assert.match(migration, new RegExp(`'${slot}'`));
  }
  assert.match(migration, /p_relationship_type='CUPID_ALLIANCE'/);
  assert.match(migration, /v_guest_heart\.pair_key<>v_target_heart\.pair_key/);
  assert.match(migration, /update guests set unlocked_role='CUPID_ALLIANCE'/);
  assert.match(migration, /update guests g set unlocked_role='LONELY_CUPID'/);
  assert.match(migration, /complete_system_mission\(v_a,'HEART_MATCH'/);
});

test('trickster signals are private, reciprocal, and limited to three guesses', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /create table if not exists trickster_signal_attempts/);
  assert.match(migration, /if v_attempts>=3 then raise exception[\s\S]+trickster_attempt_limit/);
  assert.match(migration, /if v_target\.role<>'spy' then[\s\S]+status','NO_MATCH'/);
  assert.match(migration, /player_a_confirmed=player_relationships\.player_a_confirmed or excluded\.player_a_confirmed/);
  assert.match(migration, /v_relation\.player_a_confirmed and v_relation\.player_b_confirmed/);
  const route = await readFile(connectionRouteUrl, 'utf8');
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /const guestId = await requireGuest\(\)/);
  assert.match(route, /requiredPlayerCode\(body\.targetCode\)/);
});

test('alliance fragments and relationship details stay in authenticated DTOs', async () => {
  const guestData = await readFile(guestDataUrl, 'utf8');
  assert.match(guestData, /from\('player_relationships'\)[\s\S]+\.or\(`player_a_id\.eq\.\$\{guestId\},player_b_id\.eq\.\$\{guestId\}`\)/);
  assert.match(guestData, /heart\?\.side === 'LEFT' \? fragmentConfig\.left_fragment : fragmentConfig\.right_fragment/);
  assert.doesNotMatch(guestData, /select\('\*'\)/);
  const adminRoute = await readFile(adminRouteUrl, 'utf8');
  assert.match(adminRoute, /type === 'configureStoryRole'/);
  assert.match(adminRoute, /type === 'saveAllianceClue'/);
});

test('rehearsal reset clears runtime relationships but preserves clue configuration', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const reset = migration.slice(migration.indexOf('create or replace function reset_final_mission_story_runtime'));
  assert.match(reset, /delete from player_relationships/);
  assert.match(reset, /delete from trickster_signal_attempts/);
  assert.match(reset, /update heart_slots set guest_id=null,assigned_at=null/);
  assert.match(reset, /update guests set unlocked_role='NONE'/);
  assert.doesNotMatch(reset, /delete from alliance_clue_fragments/);
});

test('printable guest cards require staff authorization and omit hidden roles', async () => {
  const page = await readFile(new URL('../app/admin/cards/page.tsx', import.meta.url), 'utf8');
  const adminData = await readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
  assert.match(page, /await requireAdmin\(\)/);
  assert.match(page, /getPrintableMissionCards/);
  assert.doesNotMatch(page, /card\.role|is_hidden_spy/);
  assert.match(adminData, /select\('id,name,login_name,player_code,participation_mode,relationship,special_card_title,special_card_body'\)/);
  assert.doesNotMatch(adminData.slice(adminData.indexOf('export async function getPrintableMissionCards')), /select\('\*'\)/);
});

test('the public leaderboard is suppressed throughout the first act', async () => {
  const source = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
  assert.match(source, /\['registration', 'waiting', 'task_round_1'\]\.includes\(game\.stage\) \? \[\] : scoreboard\.leaders/);
});
