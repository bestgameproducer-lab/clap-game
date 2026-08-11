import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('home invitation carries the Bali estate and cat Cupid story without obscuring the primary action', async () => {
  const [home, scene, styles] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/bali-invitation-scene.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(home, /<BaliInvitationScene\/>/);
  assert.match(home, /className="home-couple-title">Zimin <em>&amp;<\/em> Anrong/);
  assert.doesNotMatch(home, /NEXT_PUBLIC_WEDDING_TITLE/);
  assert.match(home, /<WeddingSignature compact\/>/);
  assert.match(home, /两位白猫丘比特，邀请你进入庄园/);
  assert.match(home, /进入婚礼任务/);
  assert.match(scene, /bali-cat-cupid-estate-v1\.jpg/);
  assert.match(scene, /巴厘岛庄园与稻田/);
  assert.match(styles, /\.bali-home-hero\{[^}]*background:linear-gradient/);
  assert.match(styles, /\.bali-home-hero \.home-cta\{background:#6c3b42/);
});
