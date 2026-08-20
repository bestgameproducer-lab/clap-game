import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('guest Lonely Cupid copy matches the exact three-point transfer boundary', async () => {
  const [page, specification] = await Promise.all([
    read('app/guest/page.tsx'),
    read('docs/phase-two-task-spec.md'),
  ]);

  assert.match(page, /目标扣 3 分、你获得 3 分/);
  assert.match(page, /目标不足 3 分时也会完整扣除/);
  assert.doesNotMatch(page, /最终只复制对方的第二轮正式任务积分/);
  assert.match(specification, /目标 -3，本人 \+3/);
  assert.match(specification, /允许目标因此低于 0 分/);
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
