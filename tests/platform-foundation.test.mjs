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
  assert.match(platformPage, /href="\/platform\/templates\/cupid-wedding-trial/);
  assert.match(builderPage, /WeddingBuilder/);
  assert.doesNotMatch(weddingEntry, /href=["']\/platform/);
});

test('flagship template explains the full customer journey and links into customization', () => {
  const templatePage = read('app/platform/templates/cupid-wedding-trial/page.tsx');

  assert.match(templatePage, /签到抽卡/);
  assert.match(templatePage, /秘密相遇/);
  assert.match(templatePage, /晚宴组队/);
  assert.match(templatePage, /投票与揭晓/);
  assert.match(templatePage, /href="\/platform\/create"/);
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
  assert.match(builder, /URL\.createObjectURL/);
  assert.match(builder, /需求单/);
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
