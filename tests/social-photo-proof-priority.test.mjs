import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const guest = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');

test('first-meeting mission presents photo proof as the primary path', () => {
  assert.match(guest, /mission_code === 'P1-SOCIAL-001' \? 'photo-primary-proof'/);
  assert.match(guest, /添加与新朋友的合影/);
  assert.match(styles, /推荐完成方式 · 上传合影/);
  assert.match(styles, /\.photo-primary-proof \.evidence-file-trigger/);
});

test('player-code confirmation is a collapsed fallback rather than a competing action', () => {
  const fallback = guest.slice(guest.indexOf('function renderMutualConfirmation'), guest.indexOf('function renderSymbolPairing'));
  assert.match(fallback, /<details className="inline-mutual-confirmation"/);
  assert.match(fallback, /无法上传合影？/);
  assert.match(fallback, /改用玩家编号确认/);
  assert.doesNotMatch(fallback, /open=/);
  assert.doesNotMatch(fallback, /一起自拍/);
});
