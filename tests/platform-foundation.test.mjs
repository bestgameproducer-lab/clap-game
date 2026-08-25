import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('commercial platform routes are isolated from the live wedding entry', () => {
  const platformPage = read('app/platform/page.tsx');
  const builderPage = read('app/platform/create/page.tsx');
  const weddingEntry = read('app/page.tsx');

  assert.match(platformPage, /FLAGSHIP_TEMPLATE\.name/);
  assert.match(platformPage, /href="\/platform\/create/);
  assert.match(builderPage, /WeddingBuilder/);
  assert.doesNotMatch(weddingEntry, /href=["']\/platform/);
});

test('platform catalog includes both commercial models and the full flagship module set', () => {
  const catalog = read('lib/platform/catalog.ts');

  assert.match(catalog, /id: 'buyout'/);
  assert.match(catalog, /id: 'subscription'/);
  for (const moduleId of [
    'secret-missions',
    'team-games',
    'host-toolkit',
    'live-scoreboard',
    'finale-vote',
  ]) {
    assert.match(catalog, new RegExp(`id: '${moduleId}'`));
  }
});

test('first-phase builder keeps drafts local and does not access production services', () => {
  const builder = read('app/platform/create/wedding-builder.tsx');

  assert.match(builder, /window\.localStorage\.setItem/);
  assert.match(builder, /isWeddingDraft/);
  assert.match(builder, /不会上传/);
  assert.doesNotMatch(builder, /fetch\s*\(/);
  assert.doesNotMatch(builder, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('platform preview stays non-indexed until accounts, billing and cloud persistence are ready', () => {
  const layout = read('app/platform/layout.tsx');
  const architecture = read('docs/platform-product-architecture.md');

  assert.match(layout, /index: false/);
  assert.match(layout, /follow: false/);
  assert.match(architecture, /当前产品预览不展示未经确认的价格/);
  assert.match(architecture, /运行数据隔离/);
});

test('platform customizer has responsive mobile layout rules', () => {
  const styles = read('app/platform/platform.module.css');

  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.builderWorkspace/);
  assert.match(styles, /\.builderPreview/);
});
