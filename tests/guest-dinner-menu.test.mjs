import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the dinner menu is available only from dinner onward and opens accessibly', async () => {
  const page = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /const DINNER_MENU_STAGES = new Set\(\['task_round_2', 'banquet', 'group_game', 'voting', 'results'\]\)/);
  assert.match(page, /dinnerMenuVisible && <button[^>]+className="dinner-menu-entry"[^>]+aria-haspopup="dialog"/);
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="dinner-menu-title"/);
  assert.match(page, /src="\/wedding-dinner-menu\.jpg"/);
  assert.match(page, /双指可放大查看菜品细节/);
  assert.match(page, /if \(event\.key === 'Escape'\) setDinnerMenuOpen\(false\)/);
});

test('the dinner menu remains available in the weak-network cache', async () => {
  const page = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

  assert.match(page, /\/sw\.js\?v=6-dinner-menu/);
  assert.match(worker, /wedding-public-shell-v6-dinner-menu/);
  assert.match(worker, /PUBLIC_ASSET_PATHS = \['\/wedding-dinner-menu\.jpg'\]/);
  assert.match(worker, /PUBLIC_ASSET_PATHS\.includes\(url\.pathname\)/);
});
