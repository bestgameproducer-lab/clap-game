import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('service worker caches only public app shells and static assets', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)\) return/);
  assert.match(source, /APP_PATHS = \['\/guest', '\/scoreboard'\]/);
  assert.match(source, /!APP_PATHS\.includes\(url\.pathname\)\) return/);
  assert.match(source, /url\.pathname\.startsWith\('\/_next\/static\/'\)/);
  for (const privatePath of ['/admin', '/host', '/station', '/api/guest-me']) {
    assert.equal(source.includes(`cache.put('${privatePath}'`), false);
  }
});

test('guest page registers offline shell without persisting private data to local storage', async () => {
  const source = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /serviceWorker\.register\('\/sw\.js'/);
  assert.match(source, /serviceWorker\.addEventListener\('controllerchange'/);
  assert.match(source, /window\.sessionStorage\.setItem\(GUEST_CACHE_KEY/);
  assert.doesNotMatch(source, /localStorage\.setItem\(GUEST_CACHE_KEY/);
  assert.match(source, /弱网备用已准备/);
  assert.match(source, /安全退出需要联网完成/);
  assert.match(source, /if \(!response\.ok\) throw new Error\('logout_failed'\)/);
});

test('service worker script is served without stale HTTP caching and with root scope', async () => {
  const source = await readFile(new URL('../next.config.mjs', import.meta.url), 'utf8');
  assert.match(source, /source: '\/sw\.js'/);
  assert.match(source, /no-cache, no-store, must-revalidate/);
  assert.match(source, /Service-Worker-Allowed/);
});

test('public scoreboard keeps a timestamped tab-only snapshot and reports stale state', async () => {
  const source = await readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /window\.sessionStorage\.setItem\(SCOREBOARD_CACHE_KEY, JSON\.stringify\(\{ data: body, cachedAt \}\)\)/);
  assert.match(source, /window\.sessionStorage\.getItem\(SCOREBOARD_CACHE_KEY\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\(SCOREBOARD_CACHE_KEY/);
  assert.match(source, /window\.localStorage\.removeItem\('wedding-scoreboard-cache'\)/);
  assert.match(source, /serviceWorker\.register\('\/sw\.js'/);
  assert.match(source, /window\.addEventListener\('offline', disconnect\)/);
  assert.match(source, /最近同步 \{lastSyncLabel\}/);
  assert.match(source, /离线刷新备用已准备/);
  assert.match(source, />\{offline \? 'CACHED' : 'LIVE'\}</);
});
