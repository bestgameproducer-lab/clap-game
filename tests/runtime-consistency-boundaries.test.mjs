import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('evidence upload authorization is terminally locked for guests and staff', async () => {
  const source = await read('lib/data/evidence.ts');
  assert.match(source, /select\('stage,results_published_at'\)/);
  assert.match(source, /select\('stage,results_published_at'\)/);
  assert.match(source, /game\?\.results_published_at[\s\S]*?验证照片已锁定/);
  assert.match(source, /confirmStaffEvidence[\s\S]*?confirm_assignment_evidence_staff_for_run/);
  assert.match(source, /removeStaffEvidence[\s\S]*?await requireEditableStaffAssignment\(assignmentId, false\)/);
});

test('rehearsal storage cleanup scans before deletion and verifies both buckets afterwards', async () => {
  const source = await read('lib/data/admin.ts');
  const cleanup = source.slice(source.indexOf('async function cleanupRehearsalStorage'));
  for (const bucket of ['task-evidence', 'guest-avatars']) {
    assert.match(source, new RegExp(`scanStorageBucket\\('${bucket}'\\)`));
  }
  assert.match(source, /STORAGE_SCAN_SENTINEL = '__storage_scan_required__'/);
  assert.match(source, /listAllStorageObjectPaths[\s\S]*?storage\.list\(prefix/);
  assert.match(cleanup, /initialEvidenceScan[\s\S]*?storage\.from\('task-evidence'\)\.remove\(batch\)[\s\S]*?evidenceVerification/);
  assert.match(cleanup, /initialAvatarScan[\s\S]*?storage\.from\('guest-avatars'\)\.remove\(batch\)[\s\S]*?avatarVerification/);
  assert.match(cleanup, /evidenceVerification\.paths/);
  assert.match(cleanup, /avatarVerification\.paths/);
  assert.match(cleanup, /pendingEvidencePaths\.length > 0/);
  assert.match(cleanup, /pendingAvatarPaths\.length > 0/);
  assert.match(cleanup, /Unable to persist evidence cleanup state/);
  assert.match(cleanup, /Unable to persist avatar cleanup state/);
});

test('station only offers server-authorized custom tasks without exposing secret roles', async () => {
  const [data, page] = await Promise.all([
    read('lib/data/station.ts'),
    read('app/station/page.tsx'),
  ]);
  assert.match(data, /\.is\('mission_code', null\)/);
  assert.match(data, /\.neq\('category', 'hidden'\)/);
  assert.doesNotMatch(data, /\.in\('category', \['upgrade', 'group', 'ceremony'\]\)/);
  assert.match(data, /role_scope,story_role_scope/);
  assert.match(data, /uses_app,eligible_for_mission/);
  assert.match(data, /const manualTaskIdsByGuest = Object\.fromEntries/);
  assert.match(data, /getManualTaskAvailability/);
  assert.match(data, /manualTaskReasonsByGuest/);
  assert.match(data, /manualTaskIdsByGuest/);
  assert.match(page, /manualTaskIdsByGuest: Record<string, string\[]>/);
  assert.match(page, /new Set\(data\?\.manualTaskIdsByGuest\?\.\[guestId\]/);
  assert.doesNotMatch(page, /guest\.role|guest\.story_role|task\.role_scope|task\.story_role_scope/);
  const returnedGuestDto = data.slice(data.indexOf('guests: (guests.data ?? []).map'), data.indexOf('assignments:', data.indexOf('guests: (guests.data ?? []).map')));
  assert.doesNotMatch(returnedGuestDto, /role:|story_role:/);
  const returnedTaskDto = data.slice(data.indexOf('tasks: (tasks.data ?? []).map'), data.indexOf('manualTaskIdsByGuest,', data.indexOf('tasks: (tasks.data ?? []).map')));
  assert.doesNotMatch(returnedTaskDto, /role_scope:|story_role_scope:|max_assignments:/);
});

test('admin controls mirror final and personal-score database boundaries', async () => {
  const page = await read('app/admin/page.tsx');
  assert.match(page, /requestStageChange[\s\S]*?data\.game\.results_published_at/);
  assert.match(page, /disabled=\{busy \|\| finalResultsLocked \|\| !isNextLiveGameStage\(data\.game\?\.stage, stage\)\}/);
  assert.match(page, /id="game-stage"[\s\S]*?disabled=\{busy \|\| finalResultsLocked\}/);
  assert.match(page, /家人组也可以获得个人分，但不会被计入海岛组或沙漠组的团队分/);
  assert.match(page, /disabled=\{finalResultsLocked \|\| !selectedGuest\.eligible_for_personal_score\}/);
  assert.match(page, /disabled=\{busy \|\| finalResultsLocked \|\| !selectedGuest\.eligible_for_personal_score/);
});

test('staff mutation routes authenticate, reject cross-origin calls, and validate idempotency keys', async () => {
  const [adminRoute, hostRoute] = await Promise.all([
    read('app/api/admin-action/route.ts'),
    read('app/api/host-action/route.ts'),
  ]);
  for (const route of [adminRoute, hostRoute]) {
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /requireAdmin\(\)/);
    assert.match(route, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  }
  assert.match(adminRoute, /requiredEnum\(body\.team, '组别', \['海岛组', '沙漠组'\] as const\)/);
  assert.match(hostRoute, /requiredEnum\(body\.team, '组别', \['海岛组', '沙漠组'\] as const\)/);
});
