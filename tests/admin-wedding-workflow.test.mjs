import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('四个主入口按婚礼现场顺序合并功能', async () => {
  const admin = await read('app/admin/page.tsx');
  const navigation = admin.slice(admin.indexOf('const PRIMARY_ADMIN_PANELS'), admin.indexOf('const ACTION_LABELS'));

  assert.match(navigation, /开场与宾客[\s\S]*现场执行[\s\S]*终局结算[\s\S]*婚礼设置/);
  assert.match(admin, /className="admin-section-tabs"[\s\S]*流程控制[\s\S]*任务审核/);
  assert.match(admin, /activePanel === 'review' \? 'live'/);
  assert.match(admin, /activePanel === 'data' \? 'content'/);
});

test('现场流程不再混入终局操作', async () => {
  const admin = await read('app/admin/page.tsx');
  const liveStart = admin.indexOf("{activePanel === 'live' && <>");
  const live = admin.slice(liveStart, admin.indexOf("{activePanel === 'review' &&", liveStart));

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
  const settlement = finale.indexOf('公布身份并结算终局个人奖励');
  const ledger = finale.indexOf('发放奖项并核对流水');
  assert.ok(awards >= 0 && teamSettlement > awards && voting > teamSettlement && settlement > voting && ledger > settlement);
  assert.match(admin, /type: 'settleTeamClues'/);
  assert.match(finale, /setPendingFinaleAction\('settle-team-clues'\)/);
  assert.match(finale, /onClick=\{toggleVoting\}/);
  assert.match(finale, /onClick=\{requestResultsToggle\}/);
  assert.match(finale, /confirmResultsToggle/);
  assert.match(finale, /只结算个人奖励，团队挑战分不会变化/);
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
