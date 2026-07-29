import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('drawn card remains visible across background guest-data refreshes', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /if \(!data\.guest\.drawn_at \|\| revealedCard\)/);
  assert.match(page, /setRevealedCard\(null\);\s*setShowSecrets\(true\)/);
  assert.match(page, /我已经看清楚 · 收起卡片/);
  assert.match(page, /卡片不会自动消失，只有你点击上方按钮后才会隐藏/);
});

test('guest UI clearly labels the functional demo task catalogue', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /task_catalog_mode: 'demo' \| 'live'/);
  assert.match(page, /演示任务 · 之后会替换/);
  assert.match(page, /用于测试领取、提交和审核流程，不代表婚礼当天的最终任务设计/);
});
