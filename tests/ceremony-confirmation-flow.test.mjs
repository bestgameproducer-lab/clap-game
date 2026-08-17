import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('host completion atomically approves and scores ceremony assignments', async () => {
  const migration = await read('supabase/migrations/202608160003_complete_ceremony_tasks_from_host.sql');
  assert.match(migration, /perform update_ceremony_assignment_before_final_lock/);
  assert.match(migration, /if p_ceremony_status='COMPLETED'/);
  assert.match(migration, /v_status in \('assigned','rejected'\)[\s\S]*status='submitted'/);
  assert.match(migration, /perform approve_assignment_with_verification/);
  assert.match(migration, /elsif v_status<>'approved'/);
});

test('host desk exposes a ceremony confirmation control', async () => {
  const [data, route, page, browserFixture, reviewFixture] = await Promise.all([
    read('lib/data/host.ts'),
    read('app/api/host-action/route.ts'),
    read('app/host/page.tsx'),
    read('e2e/wedding-surfaces.spec.mjs'),
    read('e2e/wedding-review-pack.spec.mjs'),
  ]);
  assert.match(data, /ceremony_status,ring_variant/);
  assert.match(data, /update_ceremony_assignment_for_run/);
  assert.match(route, /type === 'completeCeremonyAssignment'/);
  assert.match(page, /仪式任务确认/);
  assert.match(page, /确认完成并计分/);
  assert.match(page, /宾客可以先在任务页提交完成说明/);
  assert.doesNotMatch(page, /宾客端无需提交/);
  assert.match(browserFixture, /const hostData = \{[\s\S]*?ceremonyAssignments: \[\]/);
  assert.match(reviewFixture, /id: 'host-ring'[\s\S]*?mission_code: 'P1-CER-002'/);
  assert.match(reviewFixture, /id: 'host-speech'[\s\S]*?status: 'submitted'/);
  assert.match(reviewFixture, /23f-host-ceremony-confirmation/);
});

test('guest ceremony cards can report completion while host approval remains authoritative', async () => {
  const [page, taskUi] = await Promise.all([read('app/guest/page.tsx'), read('lib/guest-task-ui.ts')]);
  for (const missionCode of ['P1-CER-001', 'P1-CER-002', 'P1-CER-003', 'P1-CER-004', 'P2-CEREMONY-001']) {
    assert.match(taskUi, new RegExp(`'${missionCode}'`));
  }
  assert.match(page, /我已完成 · 提交验证/);
  assert.match(page, /assignment\.task\.category === 'ceremony'/);
});
