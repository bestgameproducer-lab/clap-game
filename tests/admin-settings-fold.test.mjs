import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');

test('space-heavy wedding settings modules are collapsed by default', () => {
  const settings = page.slice(page.indexOf("activePanel === 'content'"), page.indexOf("activePanel === 'guests'", page.indexOf("activePanel === 'content'")));
  assert.equal((settings.match(/<details className="section-card admin-collapsible-card settings-module-card">/g) ?? []).length, 4);
  assert.doesNotMatch(settings, /settings-module-card" open/);
  for (const title of ['任务库管理', '团队线索库', '自由图案配对', '隐藏任务实体卡']) assert.match(settings, new RegExp(`<strong>${title}<\\/strong>`));
  assert.match(styles, /\.settings-module-card\[open\]\{grid-column:1\/-1\}/);
  assert.match(styles, /\.settings-module-card>summary\{min-height:106px\}/);
});
