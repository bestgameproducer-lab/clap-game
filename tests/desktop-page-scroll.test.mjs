import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [guestPage, css] = await Promise.all([
  readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/styles.css', import.meta.url), 'utf8'),
]);

test('desktop pages keep native wheel and trackpad scrolling outside modal views', () => {
  assert.match(css, /html \{[^}]*overflow-y:auto/);
  assert.match(css, /body \{[^}]*overscroll-behavior-y: auto;[^}]*touch-action:pan-y/);
  assert.match(css, /body:not\(\.modal-scroll-locked\) \{ overflow-y:auto!important; \}/);
});

test('guest modal scroll locking is explicit and always cleaned up', () => {
  assert.match(guestPage, /classList\.toggle\('modal-scroll-locked', pageScrollLocked\)/);
  assert.match(guestPage, /classList\.remove\('modal-scroll-locked'\)/);
  assert.doesNotMatch(guestPage, /document\.body\.style\.overflow\s*=/);
  assert.match(css, /body\.modal-scroll-locked \{ overflow-y:hidden!important; \}/);
});
