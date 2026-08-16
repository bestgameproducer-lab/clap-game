import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('guest copy-score copy matches the settlement boundary', async () => {
  const [page, specification] = await Promise.all([
    read('app/guest/page.tsx'),
    read('docs/phase-two-task-spec.md'),
  ]);

  assert.match(page, /第二轮正式任务积分/);
  assert.match(page, /不含人工调整、第一轮积分、幸运星翻倍或投票奖励/);
  assert.doesNotMatch(page, /复制他在第二幕获得的个人积分/);
  assert.doesNotMatch(page, /最终只复制对方第二轮获得的个人积分/);
  assert.match(specification, /只复制目标与正式第二轮任务关联的积分/);
  assert.match(specification, /不复制后台人工调整、第一轮积分、丘比特幸运星翻倍、投票奖励或另一笔命运复制/);
});

test('guest refresh does not query or expose retired alliance clue fragments', async () => {
  const [guestData, guestPage] = await Promise.all([
    read('lib/data/guest.ts'),
    read('app/guest/page.tsx'),
  ]);

  assert.doesNotMatch(guestData, /from\('alliance_clue_fragments'\)/);
  assert.doesNotMatch(guestData, /allianceClue/);
  assert.doesNotMatch(guestPage, /allianceClue/);
});
