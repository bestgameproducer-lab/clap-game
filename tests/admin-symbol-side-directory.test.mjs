import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('organizer pairing directory lists every heart and star half', async () => {
  const [data, page, styles] = await Promise.all([
    read('lib/data/admin.ts'),
    read('app/admin/page.tsx'),
    read('app/styles.css'),
  ]);
  assert.match(data, /select\('guest_id,symbol,fragment_side,status/);
  assert.match(data, /order\('symbol'\)\.order\('fragment_side'\)/);
  assert.match(page, /fragment_side: 'LEFT' \| 'RIGHT'/);
  assert.match(page, /爱心左半/);
  assert.match(page, /星星右半/);
  assert.match(page, /方便主办方按左右半边提示/);
  assert.match(styles, /\.symbol-side-admin-list/);
});
