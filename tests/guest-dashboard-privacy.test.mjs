import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('the recurring dashboard stays visible while only a private identity is concealed', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.doesNotMatch(page, /if \(!showSecrets\) return <main className="privacy-shell"/);
  assert.match(page, /const identityVisible = hasPublicIdentity \|\| showSecrets/);
  assert.match(page, /身份已遮盖，需要时由本人点击查看/);
  assert.match(page, /aria-expanded=\{identityVisible\}/);
  assert.match(page, /identityVisible \? '隐藏身份' : '点击查看'/);
  assert.match(page, /is_hidden_spy && !data\.game\?\.results_visible && identityVisible/);
  assert.match(page, /setRevealedCard\(null\);\s*setShowSecrets\(false\)/);
});

test('public story roles and published identities bypass the privacy mask', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /isHonorGuest \|\| data\.guest\.story_role !== 'NONE' \|\| Boolean\(data\.game\?\.results_visible\)/);
  assert.match(page, /STORY_ROLE_LABELS\[data\.guest\.story_role\]/);
  assert.match(page, /OFFICIANT: \{ title: '誓词引导人'/);
  assert.match(page, /RING_KEEPER: \{ title: '戒指守护者'/);
});
