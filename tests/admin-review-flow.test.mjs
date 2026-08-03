import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminUrl = new URL('../app/admin/page.tsx', import.meta.url);
const stationUrl = new URL('../app/station/page.tsx', import.meta.url);
const stylesUrl = new URL('../app/styles.css', import.meta.url);

test('admin and station approvals do not depend on blocked browser prompts', async () => {
  const [admin, station] = await Promise.all([
    readFile(adminUrl, 'utf8'),
    readFile(stationUrl, 'utf8'),
  ]);

  assert.doesNotMatch(admin, /window\.prompt/);
  assert.doesNotMatch(station, /window\.prompt/);
  assert.match(admin, /async function approveSubmission/);
  assert.match(admin, /type: 'approve', assignmentId: submission\.id, verificationNote/);
  assert.match(station, /async function approveAtStation/);
  assert.match(station, /type: 'completeAtStation', assignmentId: assignment\.id, verificationNote/);
});

test('approval defaults to the task proof rule and keeps rejection explicit', async () => {
  const [admin, station] = await Promise.all([
    readFile(adminUrl, 'utf8'),
    readFile(stationUrl, 'utf8'),
  ]);

  for (const source of [admin, station]) {
    assert.match(source, /已按任务要求核验/);
    assert.match(source, /slice\(0, 500\)/);
    assert.match(source, /退回任务前/);
  }
  assert.match(admin, /disabled=\{busy \|\| !reviewNotes\[submission\.id\]\?\.trim\(\)\}/);
  assert.match(station, /disabled=\{busy \|\| offline[\s\S]*!reviewNotes\[assignment\.id\]\?\.trim\(\)\}/);
});

test('the live console promotes wedding settings and collapses only safety tools', async () => {
  const [admin, styles] = await Promise.all([
    readFile(adminUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  assert.match(admin, /PRIMARY_ADMIN_PANELS/);
  assert.match(admin, /PRIMARY_ADMIN_PANELS:[\s\S]*开场与宾客[\s\S]*现场执行[\s\S]*终局结算[\s\S]*婚礼设置/);
  assert.match(admin, /安全、备份与清场/);
  assert.match(admin, /高级操作：预设身份、派发任务、线索与人工积分/);
  assert.doesNotMatch(admin, /高级操作：恶作剧者私密积分/);
  assert.match(styles, /\.admin-panel-tabs\{[^}]*repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.approval-row \{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});
