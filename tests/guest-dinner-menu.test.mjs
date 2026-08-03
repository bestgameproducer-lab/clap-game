import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the dinner menu is available only from dinner onward and opens accessibly', async () => {
  const page = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /const DINNER_MENU_STAGES = new Set\(\['task_round_2', 'banquet', 'group_game', 'voting', 'results'\]\)/);
  assert.match(page, /dinnerMenuVisible && <button[^>]+className="dinner-menu-entry"[^>]+aria-haspopup="dialog"/);
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="dinner-menu-title"/);
  assert.match(page, /className="dinner-menu-image"/);
  assert.match(page, /<img src="\/wedding-dinner-menu\.jpg" alt="婚宴菜单：/);
  assert.match(page, /羊栖菜、毛豆、萝卜、西洋菜沙拉/);
  assert.match(page, /高清菜单 · 上下滑动查看全部菜品/);
  assert.match(page, /if \(event\.key !== 'Escape'\) return;[\s\S]*setDinnerMenuOpen\(false\)/);
});

test('the updated menu asset is the supplied portrait JPEG', async () => {
  const image = await readFile(new URL('../public/wedding-dinner-menu.jpg', import.meta.url));

  assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(image.byteLength > 200_000);
});

test('the dinner menu remains available in the weak-network cache', async () => {
  const page = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

  assert.match(page, /serviceWorker\.register\(SERVICE_WORKER_URL/);
  assert.match(worker, /`wedding-public-shell-\$\{DEPLOYMENT_VERSION\}`/);
  assert.match(worker, /PUBLIC_ASSET_PATHS = \['\/wedding-dinner-menu\.jpg'\]/);
  assert.match(worker, /PUBLIC_ASSET_PATHS\.includes\(url\.pathname\)/);
});
