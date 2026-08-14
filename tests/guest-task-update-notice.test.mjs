import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('审核完成或退回时报告任务更新而不是新任务', async () => {
  const [source, activityCore] = await Promise.all([
    readFile(guestPageUrl, 'utf8'),
    readFile(new URL('../lib/guest-activity-core.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(activityCore, /assignmentStatuses: Record<string, string>/);
  assert.match(activityCore, /previousStatus && previousStatus !== currentStatus && \['approved', 'rejected'\]\.includes\(currentStatus\)/);
  assert.match(source, /decision\.kind === 'assignment-updated'[\s\S]*title: '你的任务已更新'/);
  assert.match(source, /decision\.kind === 'assignment-new'[\s\S]*title: '你收到了一项新任务'/);
  assert.match(source, /load\(\{ suppressActivity: \{ assignmentId \} \}\)/);
  assert.match(source, /suppressActivity: payload\.action === 'dilemma' \? \{ dilemma: true \} : \{ copy: true \}/);
  assert.match(source, /decision\.kind === 'activity-bundle'/);
  assert.match(source, /第二轮新任务已经发放/);
});

test('玩家编号复制只有成功后才显示完成状态', async () => {
  const source = await readFile(guestPageUrl, 'utf8');
  assert.match(source, /const copied = await copyTextWithFallback\(data\.guest\.player_code\)/);
  assert.match(source, /if \(!copied\) \{[\s\S]*复制失败，请长按玩家编号手动复制/);
  assert.match(source, /const copied = await copyTextWithFallback\(playerCode\)/);
  assert.doesNotMatch(source, /navigator\.clipboard\?\.writeText/);
});

test('首轮前五名显示名次 Banner，但只有前三名显示额外积分', async () => {
  const source = await readFile(guestPageUrl, 'utf8');

  assert.match(source, /assignment\.is_initial && assignment\.completion_rank !== null && assignment\.completion_rank >= 1 && assignment\.completion_rank <= 5/);
  assert.doesNotMatch(source, /data\.game\?\.stage === 'task_round_1' \? undefined : data\.assignments\.find/);
  assert.match(source, /你是第 \{rankedReward\.completion_rank\} 位完成首轮任务的宾客/);
  assert.match(source, /rankedReward\.early_bonus_points > 0 \? '抢先完成奖励：额外 1 分已经计入你的个人积分。' : '你的首轮任务完成名次已经记录。'/);
  assert.match(source, /REWARD_ACK_KEY = 'wedding-guest-reward-ack-v2'/);
  assert.match(source, /activityFingerprint\(`\$\{data\.game\?\.rehearsal_run_id \?\? ''\}:\$\{data\.guest\.id\}:\$\{reward\.id\}:\$\{reward\.completion_rank\}`\)/);
  assert.match(source, /window\.localStorage\.setItem\(REWARD_ACK_KEY, rankedRewardKey\)/);
  assert.match(source, /rankedReward && rewardAcknowledged && <button type="button" className="reward-chip"/);
});
