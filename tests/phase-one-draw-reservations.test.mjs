import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607300003_fix_phase_one_draw_reservations.sql', import.meta.url), 'utf8');
const removalMigration = await readFile(new URL('../supabase/migrations/202607300008_remove_cupid_helper_feature.sql', import.meta.url), 'utf8');
const guestPage = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const guestData = await readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8');
const guestCss = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');
const draw = migration.slice(migration.indexOf('create or replace function draw_guest_card'));

test('preset teams, spies, and forced guest roles reserve their draw capacity', () => {
  assert.match(draw, /g\.drawn_at is null and g\.team_locked and g\.team=candidate\.team_name/);
  assert.match(draw, /g\.role_locked and g\.role='spy'/);
  assert.match(draw, /not \(v_guest\.role_locked and v_guest\.role='spy'\)/);
  assert.match(draw, /v_configured_spies>0 then 0 else greatest\(0,1-v_drawn_spies-v_reserved_spies\)/);
  assert.match(draw, /draw_preset_role_capacity_full/);
});

test('the real phase-one draw cannot select demo or unapproved missions', () => {
  assert.match(migration, /update tasks[\s\S]+set active=false[\s\S]+stage='task_round_1'/);
  assert.match(draw, /active and not is_demo and stage='task_round_1'/);
  assert.match(draw, /'P1-SOCIAL-001','P1-BONUS-001','P1-DECOY-001','P1-DECOY-002','P1-DECOY-003','P1-DECOY-004','P1-DECOY-005','P1-DECOY-006'/);
  assert.match(draw, /when t\.mission_code='P1-SOCIAL-001' then 12/);
  assert.match(draw, /mission_code='P1-TRICKSTER-001' and active and not is_demo/);
  assert.match(draw, /if v_hidden_task_id is null then raise exception[\s\S]+draw_task_missing/);
});

test('approved phase-one points and assignment limits are restored forward-only', () => {
  for (const row of [
    "('P1-CER-001',5,1)", "('P1-CER-002',3,2)", "('P1-CER-005',3,2)",
    "('P1-HEART-001',2,5)", "('P1-STAR-001',2,5)", "('P1-BONUS-001',2,3)",
    "('P1-DECOY-002',2,2)", "('P1-DECOY-003',2,2)",
  ]) assert.ok(migration.includes(row), `missing ${row}`);
});

test('Cupid helper gameplay is retired forward-only while history remains intact', () => {
  assert.match(removalMigration, /mission_code = 'P1-SPECIAL-001'/);
  assert.match(removalMigration, /set active = false/);
  assert.match(removalMigration, /drop function if exists configure_guest_hidden_role/);
  assert.match(removalMigration, /drop function if exists record_cupid_helper_action/);
  assert.match(removalMigration, /check \(hidden_role = 'NONE'\)/);
  assert.match(removalMigration, /historical_records_preserved/);
  assert.doesNotMatch(removalMigration, /drop table|truncate|delete from cupid_helper_actions/);
  assert.doesNotMatch(guestPage, /CUPID_HELPER|丘比特的帮手|\/api\/helper-action/);
  assert.doesNotMatch(adminPage, /configureHiddenRole|丘比特帮手记录|丘比特的帮手/);
  assert.doesNotMatch(guestData, /recordCupidHelperAction|cupid_helper_actions/);
});

test('family honor cards use direct affectionate titles without side labels', () => {
  for (const title of ['亲爱的妈妈','亲爱的大姑姑','亲爱的婶婶','亲爱的爸爸','亲爱的小姑姑']) assert.match(migration, new RegExp(title));
  assert.match(migration, /陪伴新郎长大/);
  assert.match(guestPage, /<small>FAMILY HONOR<\/small>/);
  assert.match(guestPage, /data\.guest\.special_card_title \|\| '亲爱的家人'/);
});

test('the card itself and the retained button both start a draw', () => {
  assert.match(guestPage, /function CardScene/);
  assert.match(guestPage, /onActivate=\{revealedCard \|\| !drawOpen \? undefined : \(\) => void drawCard\(\)\}/);
  assert.match(guestPage, /onActivate=\{specialCardRevealed \? undefined : \(\) => void revealSpecialCard\(\)\}/);
  assert.match(guestPage, /drawOpen \? '抽取我的秘密卡'/);
  assert.match(guestPage, /!specialCardRevealed && <button[^>]+>\{drawing \? '丘比特正在洗牌…' : '抽取我的惊喜卡'\}<\/button>/);
  assert.match(guestPage, /specialCardRevealed && <button[\s\S]+我已读完 · 进入游戏主页<\/button>/);
  assert.match(guestCss, /\.secret-card-trigger\{[^}]*cursor:pointer/);
});

test('new activity is a scroll-safe dialog that waits for manual dismissal', () => {
  assert.match(guestPage, /className="new-content-dialog" role="dialog" aria-modal="true"/);
  assert.match(guestPage, /setContentNotice\(null\)/);
  assert.doesNotMatch(guestPage, /setTimeout\(\(\) => setContentNotice/);
  assert.match(guestCss, /\.new-content-dialog\{[^}]*max-height:[^;}]+;overflow-y:auto/);
  assert.match(guestCss, /\.new-content-dialog header\{position:sticky/);
});
