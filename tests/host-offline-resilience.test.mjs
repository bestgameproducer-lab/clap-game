import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('host never persists private identities for offline restoration', async () => {
  const [hostSource, logoutSource, serviceWorker] = await Promise.all([
    readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/staff-logout-button.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(hostSource, /sessionStorage\.setItem\([^\n]*JSON\.stringify\(body\)/);
  assert.doesNotMatch(hostSource, /sessionStorage\.getItem\(HOST_CACHE_KEY\)/);
  assert.doesNotMatch(hostSource, /localStorage/);
  assert.match(hostSource, /HOST_CACHE_KEYS = \['wedding-host-private-cache-v1', 'wedding-host-private-cache-v2', 'wedding-host-score-cache-v1', 'wedding-host-score-cache-v2'\]/);
  assert.match(hostSource, /clearSessionStorageKeys=\{HOST_CACHE_KEYS\}/);
  assert.match(logoutSource, /window\.sessionStorage\.removeItem\(key\)/);
  assert.match(hostSource, /never restore private identities from disk/);
  assert.match(hostSource, /response\.status === 401[\s\S]*clearHostCache\(\)/);

  assert.doesNotMatch(serviceWorker, /HOST_CACHE_KEY|correct_answer|host_notes/);
  assert.match(serviceWorker, /APP_PATHS = \['\/guest', '\/scoreboard'\]/);
  assert.match(serviceWorker, /!APP_PATHS\.includes\(url\.pathname\)\) return/);
});

test('host fallback is read-only and reconnects explicitly', async () => {
  const source = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!navigator\.onLine\)[\s\S]*联网后才能加分[\s\S]*return/);
  assert.match(source, /<fieldset className="score-lock-fieldset" disabled=\{Boolean\(data\.game\?\.stage !== 'group_game' \|\| data\.game\?\.team_clues_settled_at \|\| finalLocked\)\}>/);
  assert.match(source, /<fieldset className="score-lock-fieldset" disabled=\{finalLocked\}>/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| teamForm\.amount === '' \|\| Number\(teamForm\.amount\)/);
  assert.match(source, /disabled=\{busy \|\| offline \|\| !selectedGuest \|\| Number\(guestForm\.amount\)/);
  assert.match(source, /useLiveRefresh\(\(\) => load\(\)/);
  assert.match(source, /onClick=\{\(\) => void load\(true\)\}/);
  assert.match(source, /离线只读/);
});
