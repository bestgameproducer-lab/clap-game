import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('the recurring dashboard stays visible while only a private identity is concealed', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.doesNotMatch(page, /if \(!showSecrets\) return <main className="privacy-shell"/);
  assert.match(page, /const identityVisible = hasPublicIdentity \|\| showSecrets/);
  assert.match(page, /短按住可快速查看；需要完整阅读时请点“展开查看”/);
  assert.match(page, /aria-pressed=\{identityVisible\}/);
  assert.match(page, /identityVisible \? '松开隐藏' : '按住查看'/);
  for (const handler of ['onPointerDown', 'onPointerUp', 'onPointerCancel', 'onLostPointerCapture', 'onKeyDown', 'onKeyUp', 'onBlur']) {
    assert.ok(page.includes(handler), `missing secret hold handler: ${handler}`);
  }
  assert.doesNotMatch(page, /setShowSecrets\(\(visible\) => !visible\)/);
  assert.match(page, /identityVisible \? <><strong>\{role\.title\}<\/strong><p>\{role\.note\}<\/p><\/>/);
  assert.match(page, /setRevealedCard\(null\);\s*setShowSecrets\(false\)/);
});

test('long private content opens in a scrollable reader with an explicit privacy exit', async () => {
  const page = await readFile(pageUrl, 'utf8');
  const css = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');

  assert.match(page, /setSecretReaderOpen\(true\)/);
  assert.match(page, /className=\{`secret-reader-dialog/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /身份与秘密任务/);
  assert.match(page, /readerAssignments\.map/);
  assert.match(page, /隐藏并关闭/);
  assert.match(page, /document\.visibilityState === 'hidden'/);
  assert.match(page, /window\.addEventListener\('blur', handleWindowBlur\)/);
  assert.match(page, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(css, /\.secret-reader-dialog\{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(css, /\.secret-reader-content\{[^}]*overflow-y:auto/);
  assert.match(css, /\.secret-reader-content\{[^}]*touch-action:pan-y/);
  assert.match(css, /\.secret-reader-footer\{[^}]*border-top/);
});

test('public story roles and published identities bypass the privacy mask', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /isHonorGuest \|\| data\.guest\.story_role !== 'NONE' \|\| Boolean\(data\.game\?\.results_visible\)/);
  assert.match(page, /STORY_ROLE_LABELS\[data\.guest\.story_role\]/);
  assert.match(page, /OFFICIANT: \{ title: '誓词引导人'/);
  assert.match(page, /RING_KEEPER: \{ title: '戒指守护者'/);
});
