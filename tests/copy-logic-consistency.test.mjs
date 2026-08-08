import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('couple photo cannot be completed through another guests player code', async () => {
  const [migration, guest] = await Promise.all([
    read('../supabase/migrations/202608080001_restore_new_friend_confirmation_boundary.sql'),
    read('../app/guest/page.tsx'),
  ]);
  assert.match(migration, /if v_code<>'P1-SOCIAL-001' then raise exception/);
  assert.match(migration, /respond_assignment_mutual_confirmation[\s\S]+if v_code<>'P1-SOCIAL-001' then raise exception/);
  assert.match(migration, /runtime_records_preserved',true/);
  assert.doesNotMatch(migration, /delete\s+from|truncate|drop\s+table/i);
  const mutualUi = guest.slice(guest.indexOf('function renderMutualConfirmation'), guest.indexOf('function renderSymbolPairing'));
  assert.match(mutualUi, /mission_code !== 'P1-SOCIAL-001'/);
  assert.doesNotMatch(mutualUi, /P1-SOCIAL-002/);
});

test('clues appear only after a real settlement or staff grant and team copy stays frozen', async () => {
  const [guest, scoreboard] = await Promise.all([
    read('../app/guest/page.tsx'),
    read('../app/scoreboard/page.tsx'),
  ]);
  assert.match(guest, /isActivePlayer && data\.clues\.length > 0 && <section className="section-card guest-clues-card"/);
  assert.doesNotMatch(guest, /团队挑战结算或工作人员发放后，属于你的线索会出现在这里/);
  assert.doesNotMatch(guest, /完成任务后，线索会在这里出现/);
  assert.match(scoreboard, /团队榜只统计团队挑战分，结算后会锁定/);
  assert.doesNotMatch(scoreboard, /团队榜显示已结算的团队挑战分/);
});

test('final reveal promises only personal rewards and keeps team scores frozen', async () => {
  const [admin, host, stages, specification] = await Promise.all([
    read('../app/admin/page.tsx'),
    read('../app/host/page.tsx'),
    read('../lib/game-stages.ts'),
    read('../docs/phase-two-task-spec.md'),
  ]);
  for (const source of [admin, host, stages]) {
    assert.match(source, /团队挑战分[^。；]*(不会变化|保持锁定|未改变)/);
  }
  assert.doesNotMatch(admin, /团队已结算 \+\$\{settledTeamPoints\}|团队 \+\$\{settledTeamPoints\}/);
  assert.doesNotMatch(host, /结算个人、团队与第二轮奖励/);
  assert.match(specification, /先显式执行“结算团队积分并发放线索”，再开启最终投票/);
  assert.match(specification, /包括本队恶作剧者/);
});

test('team clue settlement requires all server-authoritative pre-vote gates', async () => {
  const [migration, admin, host, adminData, hostData] = await Promise.all([
    read('../supabase/migrations/202608080002_harden_team_clue_settlement_gates.sql'),
    read('../app/admin/page.tsx'),
    read('../app/host/page.tsx'),
    read('../lib/data/admin.ts'),
    read('../lib/data/host.ts'),
  ]);
  assert.match(migration, /phase_two_team_draws_incomplete/);
  assert.match(migration, /phase_two_eligible and team=expected\.team\)<>10/);
  assert.match(migration, /not exists\(select 1 from team_points_ledger ledger where ledger\.team=expected\.team\)/);
  assert.match(migration, /count\(\*\) from clues where active and team_scope=expected\.team\)<2/);
  assert.match(migration, /team_score_snapshot=/);
  assert.doesNotMatch(migration, /delete\s+from|truncate|drop\s+table/i);
  for (const source of [admin, host]) {
    assert.match(source, /hasBothTeamScores/);
    assert.match(source, /成绩\$\{check\.scoreRecorded \? '已记录' : '未记录'\}/);
    assert.match(source, /0 分也要记录/);
  }
  for (const source of [adminData, hostData]) {
    assert.match(source, /phase_two_team_draws_incomplete/);
    assert.match(source, /分别记录海岛组和沙漠组/);
  }
});

test('every guest eligible for personal scoring can open their own ledger', async () => {
  const guest = await read('../app/guest/page.tsx');
  assert.match(guest, /data\.guest\.eligible_for_personal_score && <button type="button" className="score-orb"/);
  assert.doesNotMatch(guest, /!isHonorGuest && <button type="button" className="score-orb"/);
  assert.match(guest, /你可以和大家一起参加现场互动，获得的个人积分会显示在上方并进入个人积分榜/);
});

test('pairing invitation copy matches the one-sided code entry flow', async () => {
  const [guest, runbook] = await Promise.all([
    read('../app/guest/page.tsx'),
    read('../docs/wedding-day-runbook.md'),
  ]);
  assert.match(guest, /等待对方打开页面接受。对方不需要再次输入你的编号/);
  assert.doesNotMatch(guest, /等待对方输入你的玩家编号/);
  assert.match(runbook, /对方收到邀请后直接接受或拒绝，不需要反向输入/);
});

test('round-two prelude copy matches the action window that is already open', async () => {
  const stages = await read('../lib/game-stages.ts');
  assert.match(stages, /task_round_2:[\s\S]+按现场节奏开始行动/);
  assert.doesNotMatch(stages, /婚宴开始后再按现场节奏行动/);
});

test('operators can explicitly record a legitimate zero team score', async () => {
  const [migration, route, host] = await Promise.all([
    read('../supabase/migrations/202608080003_allow_explicit_zero_team_scores.sql'),
    read('../app/api/host-action/route.ts'),
    read('../app/host/page.tsx'),
  ]);
  assert.match(migration, /p_amount is null or abs\(p_amount\)>1000/);
  assert.match(migration, /p_amount is null or p_amount not between 0 and 100/);
  assert.match(migration, /'explicit_zero',p_amount=0/);
  assert.match(route, /requiredInteger\(body\.amount, '团队计分', 0, 100\)/);
  assert.match(host, /\[0,1,2,3,5,10\]/);
  assert.match(host, /记录 0 分/);
});

test('pairing task copy no longer asks both guests to enter player codes', async () => {
  const [migration, runbook] = await Promise.all([
    read('../supabase/migrations/202608080004_align_pairing_task_copy_with_direct_acceptance.sql'),
    read('../docs/wedding-day-runbook.md'),
  ]);
  for (const code of ['P1-HEART-001', 'P1-STAR-001', 'P1-TRICKSTER-001']) assert.match(migration, new RegExp(code));
  assert.match(migration, /一方输入对方玩家编号发出邀请/);
  assert.match(migration, /对方在自己的页面接受/);
  assert.doesNotMatch(runbook, /双方在任务展开区互输编号/);
});

test('two-team scoring does not offer a nonexistent third-place preset', async () => {
  const admin = await read('../app/admin/page.tsx');
  assert.doesNotMatch(admin, /第三名 \+1/);
  assert.match(admin, /常用 \+1/);
  assert.match(admin, /团队挑战最终成绩为零/);
});
