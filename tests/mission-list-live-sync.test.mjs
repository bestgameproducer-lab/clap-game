import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('guest missions are newest-first and independently collapsible', async () => {
  const [dataSource, guestPage, styles] = await Promise.all([
    read('lib/data/guest.ts'),
    read('app/guest/page.tsx'),
    read('app/styles.css'),
  ]);
  assert.match(dataSource, /order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/);
  assert.match(guestPage, /<details className="mission-item"/);
  assert.match(guestPage, /expandedAssignments\[assignment\.id\] \?\? index === 0/);
  assert.match(guestPage, /onToggle=/);
  assert.match(styles, /\.mission-summary/);
  assert.match(styles, /\.mission-item\[open\] \.mission-chevron/);
});

test('all live surfaces refresh while visible and ignore stale responses', async () => {
  const [hook, guest, admin, station, host, scoreboard] = await Promise.all([
    read('lib/use-live-refresh.ts'),
    read('app/guest/page.tsx'),
    read('app/admin/page.tsx'),
    read('app/station/page.tsx'),
    read('app/host/page.tsx'),
    read('app/scoreboard/page.tsx'),
  ]);
  assert.match(hook, /LIVE_REFRESH_INTERVAL_MS = 5_000/);
  for (const eventName of ['focus', 'pageshow', 'online', 'visibilitychange']) assert.ok(hook.includes(`'${eventName}'`));
  assert.match(hook, /runningRef\.current/);
  for (const source of [guest, admin, station, host, scoreboard]) {
    assert.match(source, /useLiveRefresh\(/);
    assert.match(source, /loadRequestRef/);
    assert.match(source, /requestId !== loadRequestRef\.current/);
  }
});
