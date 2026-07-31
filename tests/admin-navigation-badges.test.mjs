import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('后台主入口按婚礼操作顺序命名', async () => {
  const admin = await read('app/admin/page.tsx');
  const panels = admin.slice(admin.indexOf('const ADMIN_PANELS'), admin.indexOf('const PRIMARY_ADMIN_PANELS'));

  const preparation = panels.indexOf("shortLabel: '开场准备'");
  const live = panels.indexOf("shortLabel: '现场流程'");
  const review = panels.indexOf("shortLabel: '审核任务'");
  const finale = panels.indexOf("shortLabel: '终局'");
  assert.ok(preparation >= 0 && live > preparation && review > live && finale > review);
});

test('标题状态徽标根据内容自动展开而不强制圆形', async () => {
  const styles = await read('app/styles.css');

  assert.match(styles, /\.section-heading > span \{[^}]*min-width:30px;[^}]*width:auto;[^}]*padding:0 9px;[^}]*border-radius:999px;[^}]*white-space:nowrap;/);
  assert.match(styles, /\.section-heading > \.ready-badge \{[^}]*width:auto;[^}]*white-space:nowrap;/);
  assert.match(styles, /\.section-heading > \.warning-badge \{[^}]*width:auto;[^}]*white-space:nowrap;/);
  assert.doesNotMatch(styles, /\.section-heading > span \{\s*width:\s*30px/);
});
