import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { SignedUrlReuseCache } from '../lib/signed-url-reuse-cache.ts';

test('the invitation hero uses a static lightweight WebP with a JPEG fallback', async () => {
  const [component, original, optimized] = await Promise.all([
    readFile(new URL('../app/bali-invitation-scene.tsx', import.meta.url), 'utf8'),
    stat(new URL('../public/art/bali-cat-cupid-estate-v1.jpg', import.meta.url)),
    stat(new URL('../public/art/bali-cat-cupid-estate-v1-1080.webp', import.meta.url)),
  ]);
  assert.match(component, /<picture>/);
  assert.match(component, /bali-cat-cupid-estate-v1-1080[.]webp/);
  assert.match(component, /bali-cat-cupid-estate-v1[.]jpg/);
  assert.match(component, /fetchPriority="high"/);
  assert.ok(optimized.size < original.size * 0.25, 'optimized hero should be at least 75% smaller');
});

test('signed URLs are reused inside their safety window and can be invalidated', () => {
  const cache = new SignedUrlReuseCache(8_000, 2);
  cache.write('avatar-a', 'signed-a', 1_000);
  assert.equal(cache.read(['avatar-a'], 8_999).get('avatar-a'), 'signed-a');
  assert.equal(cache.read(['avatar-a'], 9_000).has('avatar-a'), false);

  cache.write('avatar-a', 'signed-a2', 10_000);
  cache.invalidate('avatar-a');
  assert.equal(cache.read(['avatar-a'], 10_001).has('avatar-a'), false);
});

test('signed URL reuse cache remains bounded', () => {
  const cache = new SignedUrlReuseCache(8_000, 2);
  cache.write('avatar-a', 'signed-a', 1_000);
  cache.write('avatar-b', 'signed-b', 1_000);
  cache.write('avatar-c', 'signed-c', 1_000);
  assert.equal(cache.read(['avatar-a'], 1_001).has('avatar-a'), false);
  assert.equal(cache.read(['avatar-b', 'avatar-c'], 1_001).size, 2);
});
