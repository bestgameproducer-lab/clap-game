import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607310002_phase_two_player_actions.sql', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/phase-two-action/route.ts', import.meta.url), 'utf8');
const guestData = await readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8');
const guestPage = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');

test('phase-two player mutations are authenticated, same-origin, and validated', () => {
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /await requireGuest\(\)/);
  assert.match(route, /requiredEnum\(body\.choice, '秘密选择', DILEMMA_CHOICES\)/);
  assert.match(route, /requiredUuid\(body\.targetGuestId, '复制目标'\)/);
  assert.match(guestData, /rpc\('submit_phase_two_dilemma'/);
  assert.match(guestData, /rpc\('submit_phase_two_copy_choice'/);
});

test('secret dilemmas lock each choice and reveal only after both submissions', () => {
  const dilemma = migration.slice(migration.indexOf('create or replace function submit_phase_two_dilemma'), migration.indexOf('create or replace function submit_phase_two_copy_choice'));
  assert.match(dilemma, /phase_two_action_closed/);
  assert.match(dilemma, /phase_two_choice_locked/);
  assert.match(dilemma, /player_a_choice is not null and v_row\.player_b_choice is not null/);
  assert.match(dilemma, /v_a_points:=3; v_b_points:=3/);
  assert.match(dilemma, /v_a_points:=0; v_b_points:=5/);
  assert.match(dilemma, /v_a_points:=5; v_b_points:=0/);
  assert.match(dilemma, /v_a_points:=1; v_b_points:=1/);
  assert.match(guestData, /partnerChoice: settled \?/);
  assert.match(guestData, /partnerPoints: settled \?/);
});

test('copy choice is immutable and settles only phase-two ledger points', () => {
  const copy = migration.slice(migration.indexOf('create or replace function submit_phase_two_copy_choice'), migration.indexOf('create or replace function settle_phase_two_copy_and_captain'));
  const settlement = migration.slice(migration.indexOf('create or replace function settle_phase_two_copy_and_captain'), migration.indexOf('-- Append copy/captain settlement'));
  assert.match(copy, /phase_two_copy_self/);
  assert.match(copy, /primary_mission='COPY_SCORE'/);
  assert.match(copy, /exception when unique_violation/);
  assert.match(settlement, /l\.created_at>=v_target_profile\.unlocked_at/);
  assert.match(settlement, /l\.reason<>'超级幸运星 · 第一阶段积分翻倍'/);
  assert.match(settlement, /v_copy\.settled_at is null/);
  assert.match(settlement, /settled_points=v_copy_points,settled_at=now\(\)/);
});

test('captain and copy settlement share the idempotent final reveal boundary', () => {
  assert.match(migration, /captain_bonus_settled_at is null/);
  assert.match(migration, /'领航星队长 · 团队第一'/);
  assert.match(migration, /v_result:=settle_voting_results_with_lucky_v1/);
  assert.match(migration, /v_phase_two:=settle_phase_two_copy_and_captain/);
  assert.match(migration, /delete from phase_two_dilemmas;\s+delete from phase_two_copy_choices/);
});

test('guest task cards expose explicit locked, waiting, settled, and offline states', () => {
  assert.match(guestPage, /你的选择已密封保存/);
  assert.match(guestPage, /双方选择已经揭晓/);
  assert.match(guestPage, /确认提交 · 不可修改/);
  assert.match(guestPage, /命运已经选定/);
  assert.match(guestPage, /disabled=\{busy \|\| offline \|\| !actionOpen/);
});

test('star dilemma explains the full payoff matrix before either choice is submitted', () => {
  assert.match(guestPage, /积分规则 · 必须秘密选择，不能商量/);
  assert.match(guestPage, /爱心联盟的考验/);
  assert.match(guestPage, /你将秘密选择守护彼此的「爱」/);
  assert.match(guestPage, /星光伙伴的抉择/);
  assert.match(guestPage, /你将秘密选择与伙伴「同行」/);
  assert.match(guestPage, /const cooperative = isHeart \? '爱' : '同行'/);
  assert.match(guestPage, /const selfish = isHeart \? '恨' : '独占'/);
  assert.match(guestPage, /各得 3 分/);
  assert.match(guestPage, /你 0 分 · 伙伴 5 分/);
  assert.match(guestPage, /你 5 分 · 伙伴 0 分/);
  assert.match(guestPage, /各得 1 分/);
  assert.doesNotMatch(guestPage, /合作更稳|可能拿到 5 分|只能各得 1 分/);
});
