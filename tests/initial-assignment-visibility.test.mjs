import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('guest DTO exposes draw-issued first-round tasks immediately without leaking later rounds', async () => {
  const [guestData, guestPage] = await Promise.all([
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(guestData, /isAssignmentVisibleAtStage/);
  assert.match(guestData, /isInitial: assignment\.is_initial/);
  assert.match(guestData, /missionCode: task\?\.mission_code/);
  assert.match(guestPage, /抽卡后，你领取的第一项任务会立即显示在这里/);
  assert.match(guestPage, /dashboardAssignments\.map/);
  assert.doesNotMatch(guestPage, /完成记录 · 不计个人分/);
});
