import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('viewport metadata and runtime height follow mobile browser chrome and keyboard', async () => {
  const [layout, sync] = await Promise.all([
    readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/viewport-height-sync.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(layout, /viewportFit: 'cover'/);
  assert.match(layout, /interactiveWidget: 'resizes-content'/);
  assert.match(layout, /<ViewportHeightSync\/>/);
  assert.match(sync, /window\.visualViewport\?\.height \?\? window\.innerHeight/);
  assert.match(sync, /document\.documentElement\.style\.setProperty\('--app-height'/);
  assert.match(sync, /visualViewport\?\.addEventListener\('resize', update\)/);
  assert.match(sync, /window\.addEventListener\('orientationchange', update\)/);
  assert.match(sync, /requestAnimationFrame/);
});

test('all mobile shells preserve notch and bottom toolbar safe areas', async () => {
  const css = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');

  assert.match(css, /input, select, textarea \{[^}]*font-size:16px;[^}]*touch-action:manipulation/);
  assert.match(css, /body \{[^}]*min-height:var\(--app-height,100dvh\);[^}]*overflow-x:hidden/);
  assert.match(css, /button, \.button \{[^}]*min-height:44px/);
  for (const selector of ['main', '.welcome-shell', '.dashboard-shell', '.admin-shell', '.host-shell', '.station-shell', '.draw-shell,.privacy-shell', '.scoreboard-shell']) {
    const start = css.indexOf(`${selector} {`);
    const compactStart = css.indexOf(`${selector}{`);
    const index = Math.max(start, compactStart);
    assert.ok(index >= 0, `missing ${selector}`);
    assert.match(css.slice(index, index + 520), /safe-area-inset-(?:top|bottom)/, `${selector} must preserve a safe area`);
  }
  assert.match(css, /older WeChat\/X5 engines/);
});

test('guest identity search does not force-open the WeChat keyboard', async () => {
  const source = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  const searchInput = source.slice(source.indexOf('id="guest-search"'), source.indexOf('id="guest-search"') + 320);
  assert.doesNotMatch(searchInput, /autoFocus/);
  assert.match(source, /id="claim-code"[\s\S]*inputMode="numeric"[\s\S]*pattern="\[0-9\]\{4\}"/);
});
