import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/guest/page.tsx', import.meta.url);
const stylesUrl = new URL('../app/styles.css', import.meta.url);

test('every dashboard exposes the guest player code near the hero', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /className="hero-player-code"/);
  assert.match(page, /<small>我的玩家编号<\/small>/);
  assert.match(page, /data\.guest\.player_code/);
  assert.match(page, /复制编号/);
});

test('a trickster dashboard presents one ordinary facade before the private dossier opens', async () => {
  const [page, styles] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.match(page, /data\.guest\.role === 'spy' && !data\.game\?\.results_visible/);
  assert.match(page, /data\.assignments\.filter\(\(assignment\) => assignment\.task\.category !== 'hidden'\)/);
  assert.match(page, /data\.assignments\.filter\(\(assignment\) => assignment\.task\.category === 'hidden'\)/);
  assert.match(page, /nextData\.guest\.role === 'spy' && assignment\.task\.category === 'hidden'/);
  assert.match(page, /<span>\{assignment\.task\.points\} 分<\/span>/);
  assert.doesNotMatch(page, /完成但不计个人分|完成记录 · 不计个人分/);
  assert.match(page, /className="trickster-dossier-inline"/);
  assert.match(page, /阅读后再次点击上方任务卡即可关闭/);
  assert.match(page, /trueTricksterAssignments\.map/);
  assert.match(styles, /\.trickster-dossier-inline/);
  assert.match(styles, /@keyframes trickster-dossier-reveal/);
});
