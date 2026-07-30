import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('station fallback keeps private data in tab-scoped storage only', async () => {
  const [stationSource, serviceWorker] = await Promise.all([
    readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  ]);

  assert.match(stationSource, /window\.sessionStorage\.setItem\(STATION_CACHE_KEY/);
  assert.match(stationSource, /window\.sessionStorage\.getItem\(STATION_CACHE_KEY/);
  assert.doesNotMatch(stationSource, /localStorage/);
  assert.match(stationSource, /clearSessionStorageKeys=\{\[STATION_CACHE_KEY\]\}/);
  assert.match(stationSource, /response\.status === 401[\s\S]*sessionStorage\.removeItem\(STATION_CACHE_KEY\)/);

  assert.doesNotMatch(serviceWorker, /STATION_CACHE_KEY|evidence_url/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)\) return/);
  assert.match(serviceWorker, /APP_PATHS = \['\/guest', '\/scoreboard'\]/);
  assert.match(serviceWorker, /!APP_PATHS\.includes\(url\.pathname\)\) return/);
});

test('station fallback is read-only and reconnects explicitly', async () => {
  const source = await readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!navigator\.onLine\)[\s\S]*return false/);
  assert.match(source, /disabled=\{busy \|\| offline/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| !guest\.drawn_at/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| !taskId\}/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| !clueId\}/);
  assert.match(source, /useLiveRefresh\(load/);
  assert.match(source, /onClick=\{\(\) => void load\(\)\}/);
  assert.match(source, /离线只读/);
  assert.match(source, /验证照片可能需要联网/);
});
