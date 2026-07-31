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

test('a trickster dashboard stays ordinary until the full-page private view opens', async () => {
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
  assert.match(page, /identityVisible \? <><strong>\{role\.title\}<\/strong><p>\{role\.note\}<\/p><\/>/);
  assert.match(page, /isTrickster && identityVisible && !data\.game\?\.results_visible \? 'trickster-identity'/);
  assert.match(page, /const readerAssignments = usesTricksterFacade \? trueTricksterAssignments : data\.assignments/);
  assert.match(page, /<details className="mission-item"/);
  assert.doesNotMatch(page, /trickster-dossier-inline|openTricksterDossier/);
  assert.match(page, /setSecretReaderOpen\(true\)/);
  assert.match(page, /usesTricksterFacade && secretReaderOpen/);
  assert.match(page, /className="trickster-private-shell"/);
  assert.match(page, /恶作剧者秘密界面/);
  assert.match(page, /你的真正任务/);
  assert.match(page, /readerAssignments\.map/);
  assert.match(page, /再次点击 · 隐藏内容/);
  assert.match(page, /!usesTricksterFacade && <div className="secret-reader-backdrop"/);
  assert.match(page, /isTricksterCard \? '你的伪装任务'/);
  assert.match(page, /这不是你的真正任务/);
  assert.match(styles, /\.secret-reader-command/);
  assert.match(styles, /\.trickster-private-shell/);
});
