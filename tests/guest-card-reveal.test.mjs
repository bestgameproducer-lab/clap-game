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

test('guest UI keeps unfinished task catalogue behind a clear placeholder', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /const TASK_CONTENT_READY: boolean = false/);
  assert.match(page, /任务内容待公布/);
  assert.match(page, /最终任务清单确认后会在这里统一开放，现在无需完成或提交任务/);
});
