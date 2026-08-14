import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('station never persists private runtime data across reloads', async () => {
  const [stationSource, serviceWorker] = await Promise.all([
    readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(stationSource, /sessionStorage\.setItem/);
  assert.doesNotMatch(stationSource, /sessionStorage\.getItem/);
  assert.doesNotMatch(stationSource, /localStorage/);
  assert.match(stationSource, /LEGACY_STATION_CACHE_KEYS/);
  assert.match(stationSource, /clearSessionStorageKeys=\{LEGACY_STATION_CACHE_KEYS\}/);
  assert.match(stationSource, /response\.status === 401[\s\S]*sessionStorage\.removeItem\(key\)/);
  assert.match(stationSource, /Persisting[\s\S]*cleared rehearsal reappear/);

  assert.doesNotMatch(serviceWorker, /STATION_CACHE_KEY|evidence_url/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/api\/'\)\) return/);
  assert.match(serviceWorker, /APP_PATHS = \['\/guest', '\/scoreboard'\]/);
  assert.match(serviceWorker, /!APP_PATHS\.includes\(url\.pathname\)\) return/);
});

test('station does not serialize signed evidence or stale assignments', async () => {
  const stationSource = await readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(stationSource, /stationOfflineSnapshot/);
  assert.doesNotMatch(stationSource, /sessionStorage\.setItem/);
  assert.doesNotMatch(stationSource, /localStorage\.setItem/);
});

test('station fallback is read-only and reconnects explicitly', async () => {
  const source = await readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!navigator\.onLine\)[\s\S]*return false/);
  assert.match(source, /disabled=\{busy \|\| offline/);
  assert.match(source, /const finalResultsLocked = Boolean\(data\?\.finalLocked\)/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| finalResultsLocked \|\| !specialTasks\.some/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| finalResultsLocked \|\| !data\.game\?\.team_clues_settled_at/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| finalResultsLocked \|\| !guest\.eligible_for_personal_score/);
  assert.match(source, /useLiveRefresh\(load/);
  assert.match(source, /onClick=\{\(\) => void load\(true\)\}/);
  assert.match(source, /离线只读/);
  assert.match(source, /验证照片可能需要联网/);
});
