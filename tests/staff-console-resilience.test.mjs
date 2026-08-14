import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('staff consoles immediately withdraw private data when a session expires', async () => {
  const [admin, host, station] = await Promise.all([
    read('../app/admin/page.tsx'),
    read('../app/host/page.tsx'),
    read('../app/station/page.tsx'),
  ]);
  assert.match(admin, /response\.status === 401\) \{ clearAdminSession\(\); setError\(''\); \}/);
  assert.ok((admin.match(/response\.status === 401\) clearAdminSession\(\)/g) ?? []).length >= 5);
  assert.ok((host.match(/response\.status === 401\) \{ clearHostCache\(\); setData\(null\)/g) ?? []).length >= 4);
  assert.ok((station.match(/status === 401[\s\S]{0,120}setData\(null\)/g) ?? []).length >= 4);
});

test('staff selections recover when live content is disabled or removed', async () => {
  const [admin, station] = await Promise.all([
    read('../app/admin/page.tsx'),
    read('../app/station/page.tsx'),
  ]);
  assert.match(admin, /selectableCluesForSelectedGuest\.some\(\(clue\) => clue\.id === selectedClueId\) \? selectedClueId : ''/);
  assert.match(admin, /settledClueIdsForSelectedTeam\.has\(clue\.id\)/);
  assert.match(admin, /setLibraryClueId\(\(current\) => current === 'new' \|\| data\.clues\.some\(\(clue\) => clue\.id === current && clue\.active\)/);
  assert.match(station, /const allowedTaskIds = data\.manualTaskIdsByGuest\?\.\[guestId\] \?\? \[\]/);
  assert.match(station, /setTaskId\(\(current\) => allowedTaskIds\.includes\(current\)/);
  assert.match(station, /setClueId\(\(current\) => body\.clues\?\.some\(\(clue: \{ id: string \}\) => clue\.id === current\)/);
});

test('empty staff tools explain what must be configured instead of showing blank selects', async () => {
  const [admin, station, styles] = await Promise.all([
    read('../app/admin/page.tsx'),
    read('../app/station/page.tsx'),
    read('../app/styles.css'),
  ]);
  assert.match(admin, /当前没有可补发线索/);
  assert.match(admin, /manualTaskAvailability\.reason/);
  assert.match(station, /manualTaskUnavailableReason/);
  assert.match(station, /当前没有可补发的已结算线索/);
  assert.match(station, /任务站不能现场改选其他线索/);
  assert.match(styles, /\.tool-empty-state/);
});

test('station presents the shared wedding-stage copy instead of raw database values', async () => {
  const station = await read('../app/station/page.tsx');
  assert.match(station, /gameStageCopy\(data\.game\.stage\)\.label/);
  assert.doesNotMatch(station, /当前阶段：\{data\.game\?\.stage/);
});

test('staff data does not depend on retired host-library, wallet, or alliance-editor reads', async () => {
  const [source, hostData, page] = await Promise.all([
    read('../lib/data/admin.ts'),
    read('../lib/data/host.ts'),
    read('../app/admin/page.tsx'),
  ]);
  const dashboard = source.slice(source.indexOf('export async function getAdminDashboardData'), source.indexOf('export async function getPrintableMissionCards'));
  assert.doesNotMatch(dashboard, /from\('host_segments'\)|from\('team_resources'\)|from\('alliance_clue_fragments'\)|hostSegments|resourceWallets|allianceClues/);
  assert.doesNotMatch(hostData, /HostSegmentInput|saveHostSegment|publishHostSegment|adjustTeamResources/);
  assert.doesNotMatch(page, /allianceClues|allianceForms/);
});

test('operations documents describe the current six-gate preflight and minimal host desk', async () => {
  const [readme, runbook, checklist, handoff] = await Promise.all([
    read('../README.md'),
    read('../docs/wedding-day-runbook.md'),
    read('../docs/acceptance-checklist.md'),
    read('../PROJECT_HANDOFF.md'),
  ]);
  for (const document of [readme, runbook, checklist]) {
    assert.match(document, /6 项核心|6 项/);
    assert.doesNotMatch(document, /预检[^\n]*(主持人真实答案|竞拍钱包|通用\/专属线索)/);
  }
  assert.match(handoff, /当前精简主持台不读取或展示旧主持题库答案/);
  assert.doesNotMatch(handoff, /恶作剧者秘密计分使用独立私密账本/);
});

test('host guide is a click-by-click wedding-day operating manual', async () => {
  const guide = await read('../docs/host-operator-guide.md');
  for (const section of [
    '主持人现场一分钟速查',
    '登录后先认识主持人台',
    '如何使用全员总览',
    '如何记录团队成绩',
    '如何记录个人加分',
    '如何切换婚礼环节',
    '终局四个按钮的固定顺序',
    '按钮变灰时先检查什么',
  ]) assert.match(guide, new RegExp(section));
  for (const action of [
    '确认给海岛组/沙漠组加 X 分',
    '确认给某宾客加 X 分',
    '确认切换',
    '结算团队积分并发放线索',
    '开启新一轮投票',
    '关闭本轮投票',
    '公布身份并结算',
  ]) assert.match(guide, new RegExp(action));
});
