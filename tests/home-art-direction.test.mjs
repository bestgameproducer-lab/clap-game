import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('home invitation carries the Bali estate and cat Cupid story without obscuring the primary action', async () => {
  const [home, scene, styles, layout, manifest] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/bali-invitation-scene.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/manifest.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(home, /<BaliInvitationScene\/>/);
  assert.match(scene, /import Image from 'next\/image'/);
  assert.match(scene, /<Image/);
  assert.match(scene, /sizes="\(max-width: 420px\) calc\(100vw - 64px\), 540px"/);
  assert.match(scene, /quality=\{68\}/);
  assert.match(scene, /fetchPriority="high"/);
  assert.match(scene, /placeholder="blur"/);
  assert.match(scene, /blurDataURL="data:image\/svg\+xml/);
  assert.match(scene, /priority/);
  assert.doesNotMatch(scene, /<img/);
  assert.match(home, /className="home-couple-signature">Zimin <em>&amp;<\/em> Anrong/);
  assert.doesNotMatch(home, /NEXT_PUBLIC_WEDDING_TITLE/);
  assert.match(home, /<WeddingSignature compact\/>/);
  assert.match(home, /A SECRET INVITATION/);
  assert.match(home, /猫猫丘比特发来一份秘密邀约/);
  assert.match(home, /领取我的秘密身份/);
  assert.match(scene, /bali-cat-cupid-estate-v1\.jpg/);
  assert.match(scene, /巴厘岛庄园与稻田/);
  assert.match(styles, /\.bali-home-hero\{[^}]*background:linear-gradient/);
  assert.match(styles, /\.home-cta \{[^}]*position:relative;[^}]*display:grid;[^}]*place-items:center;[^}]*text-align:center/);
  assert.match(styles, /\.home-cta b \{[^}]*position:absolute;[^}]*right:18px;[^}]*top:50%;[^}]*transform:translateY\(-50%\)/);
  assert.match(styles, /\.bali-home-hero \.home-cta\{background:#6c3b42/);
  assert.match(layout, /title: 'Zimin & Anrong · 丘比特的婚礼考验'/);
  assert.match(layout, /description: '仅限受邀宾客参与的婚礼秘密任务游戏'/);
  assert.match(manifest, /name: '丘比特的婚礼考验'/);
});
