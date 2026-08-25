import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

test('flagship capacity planner preserves the proven 32-account participation contract', () => {
  const capacity = read('lib/platform/capacity.ts');

  assert.match(capacity, /appAccounts: 32/);
  assert.match(capacity, /principals: 2/);
  assert.match(capacity, /familyMissionPlayers: 3/);
  assert.match(capacity, /familyHonorGuests: 7/);
  assert.match(capacity, /competitivePlayers: 20/);
  assert.match(capacity, /competitiveTeamSize: 10/);
  assert.match(capacity, /heartHolders: 5/);
  assert.match(capacity, /starHolders: 5/);
  assert.match(capacity, /tricksters: 2/);
  assert.match(capacity, /content\.teamOneName, content\.teamTwoName/);
  assert.match(capacity, /teamNamesDistinct/);
  assert.match(capacity, /teamNamesValid/);
  assert.match(capacity, /status: teamNamesValid \? 'ready' : 'blocked'/);
});

test('capacity CSV is generated locally with blank identity fields and no hidden-role assignment columns', () => {
  const capacity = read('lib/platform/capacity.ts');
  const component = read('app/platform/capacity/capacity-planner.tsx');
  const csvBuilder = capacity.slice(capacity.indexOf('export function buildPlatformSeatTemplateCsv'));

  assert.match(csvBuilder, /buildCsv/);
  assert.match(csvBuilder, /'display_name', 'login_name'/);
  assert.match(csvBuilder, /seat\.seatType/);
  assert.doesNotMatch(csvBuilder, /password|email|missionCode|hiddenRole|storyRole/);
  assert.match(component, /new Blob/);
  assert.match(component, /URL\.createObjectURL/);
  assert.match(component, /文件不会自动上传/);
  assert.doesNotMatch(component, /fetch\s*\(|XMLHttpRequest|FormData/);
});

test('capacity route reads only the current device draft and explains the privacy and launch boundary', () => {
  const page = read('app/platform/capacity/page.tsx');
  const component = read('app/platform/capacity/capacity-planner.tsx');
  const builder = read('app/platform/create/wedding-builder.tsx');
  const workspace = read('app/platform/project/project-workspace.tsx');

  assert.match(page, /CapacityPlanner/);
  assert.match(component, /PLATFORM_DRAFT_STORAGE_KEY/);
  assert.match(component, /本页不收集宾客姓名/);
  assert.match(component, /不是正式名单导入/);
  assert.match(component, /关系与隐藏身份由系统分配/);
  assert.match(component, /它目前是筹备材料，不是可以直接导入正式婚礼的执行指令/);
  assert.match(component, /disabled=\{!plan\.ready\}/);
  assert.match(builder, /href="\/platform\/capacity"/);
  assert.match(workspace, /href="\/platform\/capacity"/);
});
