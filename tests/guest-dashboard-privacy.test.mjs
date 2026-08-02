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
  assert.match(page, /identityVisible \? <><strong>\{identityRevealRole\.title\}<\/strong><p>\{identityRevealRole\.note\}<\/p>/);
  const missionTransition = page.slice(page.indexOf('async function enterMissionPage()'), page.indexOf('async function revealSpecialCard()'));
  assert.match(missionTransition, /setShowSecrets\(false\)/);
  assert.match(missionTransition, /setRevealedCard\(null\)/);
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
  assert.match(page, /classList\.toggle\('modal-scroll-locked', pageScrollLocked\)/);
  assert.match(css, /\.secret-reader-dialog\{[^}]*grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(css, /\.secret-reader-content\{[^}]*overflow-y:auto/);
  assert.match(css, /\.secret-reader-content\{[^}]*touch-action:pan-y/);
  assert.match(css, /\.secret-reader-footer\{[^}]*border-top/);
});

test('only ceremony story roles and published identities bypass the privacy mask', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /const PUBLIC_STORY_ROLES = new Set\(\['OFFICIANT', 'RING_KEEPER', 'GROOM_CHEERLEADER', 'BRIDE_CHEERLEADER', 'APPLAUSE_STARTER'\]\)/);
  assert.match(page, /isHonorGuest \|\| PUBLIC_STORY_ROLES\.has\(data\.guest\.story_role\) \|\| Boolean\(data\.game\?\.results_visible\)/);
  assert.doesNotMatch(page.slice(page.indexOf('const PUBLIC_STORY_ROLES'), page.indexOf('function CardScene')), /HEART_HOLDER|STAR_HOLDER/);
  assert.match(page, /STORY_ROLE_LABELS\[data\.guest\.story_role\]/);
  assert.match(page, /OFFICIANT: \{ title: '誓词引导人'/);
  assert.match(page, /RING_KEEPER: \{ title: '戒指守护者'/);
  assert.match(page, /STAR_HOLDER: \{ title: '星光寻觅者'/);
});
