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

test('a trickster dashboard replaces facade content with true content in place', async () => {
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
  assert.match(page, /const dashboardRole = usesTricksterFacade && !secretReaderOpen \? ROLE_LABELS\.guest : role/);
  assert.match(page, /identityVisible \? <><strong>\{dashboardRole\.title\}<\/strong><p>\{dashboardRole\.note\}<\/p>/);
  assert.match(page, /isTrickster && identityVisible && !data\.game\?\.results_visible && \(!usesTricksterFacade \|\| secretReaderOpen\) \? 'trickster-identity'/);
  assert.match(page, /usesTricksterFacade && secretReaderOpen \? trueTricksterAssignments : facadeAssignments/);
  assert.match(page, /<details className="mission-item"/);
  assert.doesNotMatch(page, /trickster-dossier-inline|openTricksterDossier/);
  assert.match(page, /setSecretReaderOpen\(true\)/);
  assert.match(page, /usesTricksterFacade && secretReaderOpen/);
  assert.doesNotMatch(page, /return <main className="trickster-private-shell"/);
  assert.match(page, /trickster-dashboard-revealed/);
  assert.doesNotMatch(page, /你正在查看伪装界面/);
  assert.doesNotMatch(page, /guest-trickster-toggle/);
  assert.match(page, /className="identity-reader-button"/);
  assert.match(page, />展开查看<\/button>/);
  assert.doesNotMatch(page, /identity-reader-button trickster-highlight/);
  assert.match(page, /usesTricksterFacade && showSecrets && <span className="trickster-hold-hint"/);
  assert.match(page, /点击右侧“展开查看”，可以进入你的真实界面/);
  assert.match(page, /你今天早上吃了什么？/);
  assert.match(page, /吃了仙人掌。/);
  assert.doesNotMatch(page, /你觉得丘比特今天心情怎么样？|他好像想开个玩笑。/);
  assert.match(page, /恶作剧者真正任务/);
  assert.match(page, /隐藏并恢复伪装/);
  assert.match(page, /!usesTricksterFacade && <div className="secret-reader-backdrop"/);
  assert.match(page, /isTricksterCard \? '你的伪装任务'/);
  assert.match(page, /这不是你的真正任务/);
  assert.match(styles, /\.secret-reader-command/);
  assert.match(styles, /\.trickster-real-mode-banner/);
  assert.match(styles, /\.trickster-dashboard-revealed/);
  assert.match(styles, /\.trickster-real-missions/);
});
