import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('drawn card remains visible across background guest-data refreshes', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /if \(data\.guest\.participation_mode === 'ACTIVE_PLAYER' && \(!data\.guest\.drawn_at \|\| revealedCard\)\)/);
  assert.match(page, /setData\(\(current\) => current \? \{ \.\.\.current, guest: \{ \.\.\.current\.guest, drawn_at: body\.card\.drawnAt \} \} : current\)/);
  assert.match(page, /我已经看清楚 · 收起卡片/);
  assert.match(page, /卡片不会自动消失，只有你点击上方按钮后才会隐藏/);
});

test('entering the dashboard never clears the revealed card before draw state is confirmed', async () => {
  const page = await readFile(pageUrl, 'utf8');
  const transition = page.slice(page.indexOf('async function enterMissionPage()'), page.indexOf('async function revealSpecialCard()'));

  assert.match(transition, /if \(!data\?\.guest\.drawn_at\) \{\s*const refreshed = await load\(\);\s*if \(!refreshed\) return;/);
  assert.ok(transition.indexOf('setRevealedCard(null)') > transition.indexOf('await load()'));
  assert.match(page, /disabled=\{enteringMissionPage\}/);
  assert.match(page, /正在打开游戏主页…/);
});

test('full-page guest steps reset retained mobile scroll position', async () => {
  const page = await readFile(pageUrl, 'utf8');

  // A restored authenticated guest must not be held on the loading screen just
  // because the convenience invitation-cookie check is still in flight.
  assert.match(page, /const fullPageStep = checking \|\| \(!data && deviceAccessChecking\)/);
  assert.match(page, /secret-card:\$\{revealedCard \? 'revealed' : 'ready'\}/);
  assert.match(page, /window\.scrollTo\(0, 0\)/);
  assert.match(page, /document\.documentElement\.scrollTop = 0/);
  assert.match(page, /window\.requestAnimationFrame\(resetScroll\)/);
  assert.match(page, /\}, \[fullPageStep\]\)/);
});

test('guest UI clearly labels the functional demo task catalogue', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /task_catalog_mode: 'demo' \| 'live'/);
  assert.match(page, /演示任务 · 之后会替换/);
  assert.match(page, /用于测试领取、提交和审核流程，不代表婚礼当天的最终任务设计/);
});

test('a revealed trickster card distinguishes the facade task from the true mission', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /isTricksterCard \? '你的伪装任务'/);
  assert.match(page, /这不是你的真正任务/);
  assert.match(page, /主页的“展开查看”通往真实界面/);
  assert.match(page, /当前页面才会替换为你的真正信息/);
});
