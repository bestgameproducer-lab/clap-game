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
  assert.match(guestPage, /expandedAssignments\[assignment\.id\] \?\? false/);
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

test('background refresh stays visually silent while manual guest refresh has feedback', async () => {
  const [guest, station, host, scoreboard, styles] = await Promise.all([
    read('app/guest/page.tsx'),
    read('app/station/page.tsx'),
    read('app/host/page.tsx'),
    read('app/scoreboard/page.tsx'),
    read('app/styles.css'),
  ]);
  assert.match(guest, /useLiveRefresh\(async \(\) => \{ if \(!manualRefreshRef\.current\) await load\(\); \}/);
  assert.doesNotMatch(guest, /正在同步最新状态/);
  assert.doesNotMatch(station, /正在同步任务站/);
  assert.doesNotMatch(host, /正在同步主持台/);
  assert.match(guest, /refreshManually\(\)/);
  assert.match(guest, /状态已刷新/);
  assert.match(guest, /manualRefreshing \? '刷新中…' : '刷新状态'/);
  assert.match(styles, /\.refresh-button\.refreshing \.refresh-icon/);
  assert.match(scoreboard, /自动更新已开启\{offline \?/);
});
