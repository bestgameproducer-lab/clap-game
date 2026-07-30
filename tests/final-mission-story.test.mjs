import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607300001_phase_one_real_missions.sql', import.meta.url);
const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);
const guestDataUrl = new URL('../lib/data/guest.ts', import.meta.url);
const adminRouteUrl = new URL('../app/api/admin-action/route.ts', import.meta.url);
const connectionRouteUrl = new URL('../app/api/guest-connection/route.ts', import.meta.url);

test('the complete phase-one real mission catalogue replaces the superseded rehearsal draw', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  for (const code of [
    'P1-CER-001','P1-CER-002','P1-CER-003','P1-CER-004','P1-CER-005',
    'P1-HEART-001','P1-STAR-001','P1-SOCIAL-001','P1-BONUS-001','P1-SPECIAL-001',
    'P1-DECOY-001','P1-DECOY-002','P1-DECOY-003','P1-DECOY-004','P1-DECOY-005','P1-DECOY-006','P1-TRICKSTER-001',
  ]) assert.match(migration, new RegExp(`'${code}'`));
  assert.match(migration, /'P1-CER-001'[\s\S]+,5,'guest','ceremony'/);
  assert.match(migration, /'P1-HEART-001'[\s\S]+,2,'guest','standard'/);
  assert.match(migration, /'P1-TRICKSTER-001'[\s\S]+,0,'spy','hidden','task_round_1'/);
});

test('phase-one tricksters receive an ordinary facade task while scoring remains server-private', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /v_task_stage='task_round_1' and v_role='spy'/);
  assert.match(migration, /then 0 else v_task_points end/);
  assert.match(migration, /if v_points<>0 then[\s\S]+insert into points_ledger/);
  assert.match(migration, /Ranked upgrades and clue rewards intentionally start after phase one/);
  assert.match(migration, /v_game_stage<>'task_round_1'/);
  const guestPage = await readFile(guestPageUrl, 'utf8');
  assert.doesNotMatch(guestPage, /完成但不计个人分|完成记录 · 不计个人分/);
  assert.match(guestPage, /usesTricksterFacade/);
  assert.match(guestPage, /assignment\.task\.category !== 'hidden'/);
  assert.match(guestPage, /真正的间谍任务/);
});

test('heart and star matching are free and finalize the natural fifth player', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /create table if not exists symbol_pairing_assignments/);
  assert.match(migration, /symbol text not null check\(symbol in \('HEART','STAR'\)\)/);
  assert.doesNotMatch(migration, /HEART-A-L|HEART-SOLO|pair_key='SOLO'/);
  assert.match(migration, /p_relationship_type in \('CUPID_ALLIANCE','STAR_ALLIANCE'\)/);
  assert.match(migration, /v_paired<>4 or v_pending<>0/);
  assert.match(migration, /'LONELY_CUPID' else 'GUIDING_STAR'/);
  assert.match(migration, /status='UNPAIRED_FINAL'/);
});

test('trickster signals start in phase one and use the configurable five-attempt default', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /from trickster_signal_attempts where guest_id=v_guest\.id/);
  assert.match(migration, /trickster_max_attempts integer not null default 5/);
  assert.match(migration, /if v_stage<>'task_round_1' then raise exception[\s\S]+trickster_connection_stage_closed/);
  assert.match(migration, /if v_attempts>=v_max_attempts then raise exception[\s\S]+trickster_attempt_limit/);
  assert.match(migration, /if v_target\.role<>'spy' then[\s\S]+status','NO_MATCH'/);
  assert.match(migration, /player_a_confirmed=case when player_relationships\.status='REJECTED'/);
  assert.match(migration, /v_relation\.player_a_confirmed and v_relation\.player_b_confirmed/);
  const route = await readFile(connectionRouteUrl, 'utf8');
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /const guestId = await requireGuest\(\)/);
  assert.match(route, /requiredPlayerCode\(body\.targetCode\)/);
});

test('alliance fragments and relationship details stay in authenticated DTOs', async () => {
  const guestData = await readFile(guestDataUrl, 'utf8');
  assert.match(guestData, /from\('player_relationships'\)[\s\S]+\.or\(`player_a_id\.eq\.\$\{guestId\},player_b_id\.eq\.\$\{guestId\}`\)/);
  assert.match(guestData, /from\('symbol_pairing_assignments'\)/);
  assert.match(guestData, /guest\.hidden_role === 'CUPID_HELPER'/);
  assert.doesNotMatch(guestData, /select\('\*'\)/);
  const adminRoute = await readFile(adminRouteUrl, 'utf8');
  assert.match(adminRoute, /type === 'configureStoryRole'/);
  assert.match(adminRoute, /type === 'configureHiddenRole'/);
  assert.match(adminRoute, /type === 'undoRelationship'/);
});

test('rehearsal reset clears runtime relationships but preserves clue configuration', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const reset = migration.slice(migration.indexOf('create or replace function reset_final_mission_story_runtime'));
  assert.match(reset, /delete from player_relationships/);
  assert.match(reset, /delete from trickster_signal_attempts/);
  assert.match(reset, /delete from symbol_pairing_assignments/);
  assert.match(reset, /delete from cupid_helper_actions/);
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
