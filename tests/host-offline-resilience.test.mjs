import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('host fallback keeps private data in tab-scoped storage only', async () => {
  const [hostSource, logoutSource, serviceWorker] = await Promise.all([
    readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/staff-logout-button.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  ]);

  assert.match(hostSource, /window\.sessionStorage\.setItem\(HOST_CACHE_KEY/);
  assert.match(hostSource, /window\.sessionStorage\.getItem\(HOST_CACHE_KEY/);
  assert.doesNotMatch(hostSource, /localStorage/);
  assert.match(hostSource, /HOST_CACHE_KEYS = \['wedding-host-private-cache-v1', 'wedding-host-private-cache-v2', HOST_CACHE_KEY\]/);
  assert.match(hostSource, /clearSessionStorageKeys=\{HOST_CACHE_KEYS\}/);
  assert.match(logoutSource, /window\.sessionStorage\.removeItem\(key\)/);
  assert.match(hostSource, /response\.status === 401[\s\S]*clearHostCache\(\)/);

  assert.doesNotMatch(serviceWorker, /HOST_CACHE_KEY|correct_answer|host_notes/);
  assert.match(serviceWorker, /APP_PATHS = \['\/guest', '\/scoreboard'\]/);
  assert.match(serviceWorker, /!APP_PATHS\.includes\(url\.pathname\)\) return/);
});

test('host fallback is read-only and reconnects explicitly', async () => {
  const source = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!navigator\.onLine\)[\s\S]*联网后才能加分[\s\S]*return/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| Number\(teamForm\.amount\)/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| !selectedGuest/);
  assert.match(source, /useLiveRefresh\(\(\) => load\(\)/);
  assert.match(source, /onClick=\{\(\) => void load\(true\)\}/);
  assert.match(source, /离线只读/);
});
