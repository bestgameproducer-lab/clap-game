import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('首页入口遵循婚礼现场的操作顺序', async () => {
  const admin = await read('app/admin/page.tsx');
  const launchpad = admin.slice(admin.indexOf('launchpad-grid launchpad-primary'), admin.indexOf('admin-advanced-tools admin-setup-links'));

  const preparation = launchpad.indexOf("openPanel('guests')");
  const live = launchpad.indexOf("openPanel('live')");
  const review = launchpad.indexOf("openPanel('review')");
  const finale = launchpad.indexOf("openPanel('finale')");
  const settings = launchpad.indexOf("openPanel('content')");
  assert.ok(preparation >= 0 && live > preparation && review > live && finale > review && settings > finale);
  assert.match(launchpad, /01[\s\S]*宾客管理/);
  assert.match(launchpad, /02[\s\S]*现场流程/);
  assert.match(launchpad, /03[\s\S]*审核任务/);
  assert.match(launchpad, /04[\s\S]*终局结算/);
  assert.match(launchpad, /05[\s\S]*婚礼设置/);
});

test('现场流程不再混入终局操作', async () => {
  const admin = await read('app/admin/page.tsx');
  const live = admin.slice(admin.indexOf("activePanel === 'live'"), admin.indexOf("activePanel === 'review'"));

  assert.doesNotMatch(live, /onClick=\{toggleVoting\}/);
  assert.doesNotMatch(live, /onClick=\{toggleResults\}/);
  assert.match(live, /toggleScoreboard/);
  assert.match(live, /统一在“终局结算”操作/);
});

test('终局结算按颁奖、团队结算、投票、揭晓和流水引导', async () => {
  const admin = await read('app/admin/page.tsx');
  const finale = admin.slice(admin.indexOf("activePanel === 'finale'"), admin.indexOf("activePanel === 'data'", admin.indexOf("activePanel === 'finale'")));

  const awards = finale.indexOf('确认颁奖结果');
  const teamSettlement = finale.indexOf('结算团队积分并发放线索');
  const voting = finale.indexOf('开启并收集最终投票');
  const settlement = finale.indexOf('公布身份并结算全部积分');
  const ledger = finale.indexOf('发放奖项并核对流水');
  assert.ok(awards >= 0 && teamSettlement > awards && voting > teamSettlement && settlement > voting && ledger > settlement);
  assert.match(admin, /type: 'settleTeamClues'/);
  assert.match(finale, /setPendingFinaleAction\('settle-team-clues'\)/);
  assert.match(finale, /onClick=\{toggleVoting\}/);
  assert.match(finale, /onClick=\{requestResultsToggle\}/);
  assert.match(finale, /confirmResultsToggle/);
  assert.match(finale, /投票、团队奖励和第二轮能力/);
  assert.match(finale, /id="final-awards"/);
  assert.match(finale, /id="final-points-ledger"/);
});

test('安全设置和开场检查归入对应准备模块', async () => {
  const admin = await read('app/admin/page.tsx');

  assert.match(admin, /activePanel === 'data'[\s\S]*管理员密码/);
  assert.match(admin, /activePanel === 'guests'[\s\S]*开场检查/);
});

test('开场检查只展开待处理事项并折叠已通过明细', async () => {
  const admin = await read('app/admin/page.tsx');
  const css = await read('app/styles.css');

  assert.match(admin, /pendingPreflightItems = data\.preflight\.items\.filter\(\(item\) => item\.status !== 'ready'\)/);
  assert.match(admin, /passedPreflightItems = data\.preflight\.items\.filter\(\(item\) => item\.status === 'ready'\)/);
  assert.match(admin, /pendingPreflightItems\.map/);
  assert.match(admin, /className="readiness-passed-details"[\s\S]*passedPreflightItems\.map/);
  assert.match(admin, /无需逐项确认/);
  assert.match(css, /\.readiness-passed-details/);
});
