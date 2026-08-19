import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, route, hostData, hostPage, guestData, guestPage, styles] = await Promise.all([
  readFile(new URL('../supabase/migrations/202608180001_family_random_and_capture_rewards.sql', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/host-action/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../lib/data/host.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/styles.css', import.meta.url), 'utf8'),
]);

test('family wins select one eligible family guest on the server and add exactly one personal point', () => {
  const award = migration.slice(
    migration.indexOf('create or replace function award_random_family_guest_point_for_run'),
    migration.indexOf('create or replace function settle_voting_results_with_lucky_v1'),
  );
  assert.match(award, /active and uses_app and eligible_for_personal_score and team='家人组'/);
  assert.match(award, /order by random\(\)[\s\S]*limit 1[\s\S]*for update/);
  assert.match(award, /update guests set points=v_total where id=v_guest\.id/);
  assert.match(award, /values\(v_guest\.id,1,v_reason,p_event_key,p_actor\)/);
  assert.doesNotMatch(award, /team_points_ledger/);
  assert.match(award, /v_state\.stage<>'group_game'/);
  assert.match(award, /results_published_at is not null or exists\(select 1 from result_rewards\)/);
});

test('family random scoring is retry-safe, run-scoped, audited, and service-only', () => {
  const award = migration.slice(
    migration.indexOf('create or replace function award_random_family_guest_point_for_run'),
    migration.indexOf('create or replace function settle_voting_results_with_lucky_v1'),
  );
  assert.match(award, /perform assert_current_rehearsal_run\(p_rehearsal_run_id\)/);
  assert.match(award, /pg_advisory_xact_lock\(hashtext\('host-family-random:'\|\|p_event_key::text\)\)/);
  assert.match(award, /select \* into v_existing from points_ledger where event_key=p_event_key/);
  assert.match(award, /'replayed',true/);
  assert.match(award, /'host\.family_random_point'/);
  assert.match(migration, /revoke all on function award_random_family_guest_point_for_run\(uuid,text,uuid\)[\s\S]*from public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function award_random_family_guest_point_for_run\(uuid,text,uuid\)[\s\S]*to service_role/);
});

test('the host endpoint never accepts a client-selected family guest or point amount', () => {
  const branch = route.slice(
    route.indexOf("if (type === 'awardRandomFamilyPoint')"),
    route.indexOf("if (type === 'toggleVoting')"),
  );
  assert.match(branch, /awardRandomFamilyGuestPoint/);
  assert.match(branch, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.match(branch, /rehearsalRunId: currentRunId\(\)/);
  assert.doesNotMatch(branch, /body\.guestId|body\.amount|body\.reason/);
  assert.match(hostData, /rpc\('award_random_family_guest_point_for_run'/);
});

test('host and guest interfaces explain every new scoring outcome', () => {
  assert.match(hostPage, /家人组赢得现场游戏/);
  assert.match(hostPage, /随机抽取一位 · \+1 分/);
  assert.match(hostPage, /确认家人组随机个人奖励/);
  assert.match(hostPage, /不会增加任何团队分/);
  assert.match(hostPage, /type: 'awardRandomFamilyPoint'/);
  assert.match(styles, /\.family-random-award/);
  assert.match(guestPage, /投中者 \+2 分，其他已投票者 \+1 分/);
  assert.match(guestPage, /若恶作剧者逃脱，本队所有人都不获得投票分/);
  assert.match(guestPage, /本队成功抓出恶作剧者 · 你获得参与奖励/);
  assert.match(guestPage, /本队未能抓住恶作剧者 · 本轮不加分/);
  assert.match(guestData, /teamCaught: ownTeamTrickster \? !ownTeamTrickster\.escaped : null/);
});

test('family random reward is located in team scoring and tab changes clear pending confirmations', () => {
  const teamPanelStart = hostPage.indexOf(": mode === 'team' ?");
  const personalPanelStart = hostPage.indexOf(": mode === 'guest' ?", teamPanelStart);
  const familyReward = hostPage.indexOf('aria-label="家人组随机个人奖励"');
  assert.ok(teamPanelStart >= 0 && personalPanelStart > teamPanelStart);
  assert.ok(familyReward > teamPanelStart && familyReward < personalPanelStart);
  assert.match(hostPage, /家人组也可以获得个人积分，胜出时使用下方随机奖励/);
  assert.match(hostPage, /function selectMode\(nextMode: typeof mode\)[\s\S]*setPendingFamilyAward\(false\)/);
});
