import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  countActiveManualTaskAssignments,
  evaluateManualTaskEligibility,
  getManualTaskAvailability,
} from '../lib/manual-task-eligibility.ts';

const guest = {
  id: 'guest-1', active: true, uses_app: true, participation_mode: 'ACTIVE_PLAYER',
  eligible_for_mission: true, drawn_at: '2026-08-22T01:00:00Z', role: 'guest', story_role: 'NONE',
};
const task = {
  id: 'task-1', active: true, is_demo: true, formal_allowed: false, mission_code: null,
  category: 'standard', role_scope: 'all', story_role_scope: 'NONE', stage: 'task_round_1',
  max_assignments: 2,
};
const input = {
  guest, task, taskCatalogMode: 'demo', gameStage: 'waiting', assignments: [],
};

test('manual task eligibility mirrors every guest and catalog boundary', () => {
  assert.equal(evaluateManualTaskEligibility(input).code, 'eligible');
  const cases = [
    [{ taskCatalogMode: 'live' }, 'catalog_not_demo'],
    [{ guest: { ...guest, active: false } }, 'guest_inactive'],
    [{ guest: { ...guest, uses_app: false } }, 'guest_no_app'],
    [{ guest: { ...guest, participation_mode: 'HONOR_GUEST' } }, 'guest_not_active_player'],
    [{ guest: { ...guest, eligible_for_mission: false } }, 'guest_mission_ineligible'],
    [{ guest: { ...guest, drawn_at: null } }, 'guest_not_drawn'],
    [{ task: { ...task, active: false } }, 'task_inactive'],
    [{ task: { ...task, is_demo: false } }, 'task_not_demo'],
    [{ task: { ...task, formal_allowed: true } }, 'task_formal'],
    [{ task: { ...task, mission_code: 'P1-CER-001' } }, 'task_formal'],
    [{ task: { ...task, category: 'hidden' } }, 'task_hidden'],
    [{ task: { ...task, role_scope: 'spy' } }, 'role_mismatch'],
    [{ task: { ...task, story_role_scope: 'OFFICIANT' } }, 'story_role_mismatch'],
    [{ gameStage: 'task_round_1' }, 'stage_closed'],
  ];
  for (const [override, expected] of cases) {
    assert.equal(evaluateManualTaskEligibility({ ...input, ...override }).code, expected);
  }
});

test('manual task stage matrix matches wedding action windows', () => {
  for (const gameStage of ['registration', 'waiting', 'ceremony_end', 'task_round_2', 'banquet', 'group_game']) {
    assert.equal(evaluateManualTaskEligibility({ ...input, gameStage }).eligible, true, `phase one at ${gameStage}`);
  }
  for (const gameStage of ['task_round_2', 'banquet', 'group_game']) {
    assert.equal(evaluateManualTaskEligibility({ ...input, gameStage, task: { ...task, stage: 'task_round_2' } }).eligible, true, `phase two at ${gameStage}`);
  }
  assert.equal(evaluateManualTaskEligibility({ ...input, gameStage: 'banquet', task: { ...task, stage: 'group_game' } }).code, 'stage_closed');
  assert.equal(evaluateManualTaskEligibility({ ...input, gameStage: 'group_game', task: { ...task, stage: 'group_game' } }).eligible, true);
});

test('capacity excludes the assignment being replaced and ignores cancelled assignments', () => {
  const assignments = [
    { id: 'current', guest_id: 'other-1', task_id: task.id, status: 'assigned' },
    { id: 'cancelled', guest_id: 'other-2', task_id: task.id, status: 'cancelled' },
    { id: 'active', guest_id: 'other-3', task_id: task.id, status: 'approved' },
  ];
  assert.equal(countActiveManualTaskAssignments(assignments, task.id), 2);
  assert.equal(countActiveManualTaskAssignments(assignments, task.id, 'current'), 1);
  assert.equal(evaluateManualTaskEligibility({ ...input, assignments }).code, 'capacity_full');
  assert.equal(evaluateManualTaskEligibility({ ...input, assignments, excludeAssignmentId: 'current' }).code, 'eligible');
});

test('permanent assignment history is filtered before a database uniqueness error', () => {
  const assignments = [{ id: 'old', guest_id: guest.id, task_id: task.id, status: 'cancelled' }];
  assert.equal(evaluateManualTaskEligibility({ ...input, assignments }).code, 'already_assigned');
});

test('empty availability explains the actionable blocking gate', () => {
  const notDrawn = getManualTaskAvailability({ ...input, guest: { ...guest, drawn_at: null }, tasks: [task] });
  assert.deepEqual(notDrawn.tasks, []);
  assert.match(notDrawn.reason, /还没有完成抽卡/);

  const full = getManualTaskAvailability({
    ...input,
    tasks: [task],
    assignments: [
      { id: 'one', guest_id: 'other-1', task_id: task.id, status: 'assigned' },
      { id: 'two', guest_id: 'other-2', task_id: task.id, status: 'approved' },
    ],
  });
  assert.match(full.reason, /名额已经派完/);
});

test('admin and station consume one validator and the forward migration enforces demo-only tasks', async () => {
  const [admin, stationData, stationPage, migration] = await Promise.all([
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202608140004_align_manual_task_candidate_validation.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(admin, /getManualTaskAvailability/);
  assert.match(admin, /manualTaskAvailability\.reason/);
  assert.match(stationData, /getManualTaskAvailability/);
  assert.match(stationData, /manualTaskReasonsByGuest/);
  assert.match(stationPage, /manualTaskUnavailableReason/);
  assert.match(migration, /not v_task\.is_demo or v_task\.category='hidden'/);
  assert.match(migration, /a\.id is distinct from p_exclude_assignment_id/);
});
