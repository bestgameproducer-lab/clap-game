import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('审核完成或退回时报告任务更新而不是新任务', async () => {
  const source = await readFile(guestPageUrl, 'utf8');

  assert.match(source, /assignmentStatuses: Record<string, string>/);
  assert.match(source, /previousSnapshot\.assignmentStatuses\[assignment\.id\][\s\S]*\['approved', 'rejected'\]\.includes\(assignment\.status\)/);
  assert.match(source, /else if \(updatedAssignment\) \{[\s\S]*title: '你的任务已更新'/);
  assert.match(source, /else if \(newAssignment\) nextNotice = \{ title: '你收到了一项新任务'/);
});

test('首轮完成后立即为前十名显示名次 Banner', async () => {
  const source = await readFile(guestPageUrl, 'utf8');

  assert.match(source, /assignment\.is_initial && assignment\.completion_rank !== null && assignment\.completion_rank >= 1 && assignment\.completion_rank <= 10/);
  assert.doesNotMatch(source, /data\.game\?\.stage === 'task_round_1' \? undefined : data\.assignments\.find/);
  assert.match(source, /你是第 \{rankedReward\.completion_rank\} 位完成首轮任务的宾客/);
});
