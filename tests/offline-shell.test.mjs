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

test('guest page registers offline shell without persisting private game data in browser storage', async () => {
  const source = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /serviceWorker\.register\(SERVICE_WORKER_URL/);
  assert.match(source, /updateViaCache: 'none'/);
  assert.match(source, /addEventListener\('pageshow', checkForUpdate\)/);
  assert.match(source, /addEventListener\('visibilitychange', checkForUpdate\)/);
  assert.match(source, /serviceWorker\.addEventListener\('controllerchange'/);
  assert.doesNotMatch(source, /GUEST_CACHE_KEY|sessionStorage\.setItem/);
  assert.match(source, /LEGACY_PRIVATE_SESSION_KEYS/);
  assert.match(source, /sessionStorage\.removeItem\(key\)/);
  assert.match(source, /为避免显示上一轮的任务或线索，请联网后重试/);
  assert.match(source, /弱网备用已准备/);
  assert.match(source, /安全退出需要联网完成/);
  assert.match(source, /if \(!response\.ok\) throw new Error\('logout_failed'\)/);
});

test('service worker script is served without stale HTTP caching and with root scope', async () => {
  const [source, worker, deployment] = await Promise.all([
    readFile(new URL('../next.config.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/deployment.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /source: '\/sw\.js'/);
  assert.match(source, /no-cache, no-store, must-revalidate/);
  assert.match(source, /Service-Worker-Allowed/);
  assert.match(source, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(deployment, /SERVICE_WORKER_URL = `\/sw\.js\?v=\$\{encodeURIComponent\(DEPLOYMENT_VERSION\)\}`/);
  assert.match(worker, /new URL\(self\.location\.href\)\.searchParams\.get\('v'\)/);
  assert.match(worker, /`wedding-public-shell-\$\{DEPLOYMENT_VERSION\}`/);
  assert.doesNotMatch(worker, /v\d+-neutral-dilemma/);
});

test('public scoreboard keeps only the already-rendered board in memory and reports stale state', async () => {
  const source = await readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SCOREBOARD_CACHE_KEY|sessionStorage\.setItem|localStorage/);
  assert.match(source, /LEGACY_SCOREBOARD_SESSION_KEYS/);
  assert.match(source, /sessionStorage\.removeItem\(key\)/);
  assert.match(source, /never restore a previous rehearsal's scores after reload/);
  assert.match(source, /setData\(\(current\) => current\)/);
  assert.match(source, /serviceWorker\.register\(SERVICE_WORKER_URL/);
  assert.match(source, /updateViaCache: 'none'/);
  assert.match(source, /window\.addEventListener\('offline', disconnect\)/);
  assert.match(source, /最近同步 \{lastSyncLabel\}/);
  assert.match(source, /离线刷新备用已准备/);
  assert.match(source, />\{offline \? 'CACHED' : 'LIVE'\}</);
});
