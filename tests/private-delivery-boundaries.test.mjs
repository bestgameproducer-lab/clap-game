import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('all pages explicitly opt this invitation-only wedding out of indexing', async () => {
  const [layout, config] = await Promise.all([
    readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../next.config.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(layout, /robots:\s*\{[\s\S]*index: false,[\s\S]*follow: false,[\s\S]*noimageindex: true/);
  assert.match(config, /X-Robots-Tag[\s\S]*noindex, nofollow, noarchive, noimageindex/);
});

test('API errors are never eligible for shared or browser caching', async () => {
  const errors = await readFile(new URL('../lib/errors.ts', import.meta.url), 'utf8');
  assert.match(errors, /response\.headers\.set\('Cache-Control', 'private, no-store, max-age=0'\)/);
  assert.match(errors, /if \(error instanceof ApiError\)[\s\S]*response = NextResponse\.json[\s\S]*response\.headers\.set/);
});
