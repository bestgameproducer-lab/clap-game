import assert from 'node:assert/strict';
import test from 'node:test';
import { isAssignmentVisibleAtStage, isTaskVisibleAtStage, isTaskWaitingForStage } from '../lib/game-rules.ts';

test('keeps future-round tasks hidden from guests', () => {
  assert.equal(isTaskVisibleAtStage('task_round_2', 'task_round_1'), false);
  assert.equal(isTaskVisibleAtStage('group_game', 'task_round_2'), false);
});

test('reveals current and completed-round tasks', () => {
  assert.equal(isTaskVisibleAtStage('task_round_1', 'task_round_1'), true);
  assert.equal(isTaskVisibleAtStage('task_round_1', 'group_game'), true);
  assert.equal(isTaskVisibleAtStage('task_round_2', 'results'), true);
});

test('fails closed for missing or unknown game stages', () => {
  assert.equal(isTaskVisibleAtStage('task_round_1', undefined), false);
  assert.equal(isTaskVisibleAtStage('group_game', 'unexpected'), false);
  assert.equal(isTaskVisibleAtStage(undefined, 'task_round_1'), false);
  assert.equal(isTaskVisibleAtStage('unexpected', 'results'), false);
});

test('reveals only draw-issued first-round assignments before the round opens', () => {
  assert.equal(isAssignmentVisibleAtStage({ taskStage: 'task_round_1', gameStage: 'registration', isInitial: true, missionCode: 'P1-SOCIAL-001' }), true);
  assert.equal(isAssignmentVisibleAtStage({ taskStage: 'task_round_1', gameStage: 'waiting', isInitial: false, missionCode: 'P1-TRICKSTER-001' }), true);
  assert.equal(isAssignmentVisibleAtStage({ taskStage: 'task_round_1', gameStage: 'registration', isInitial: false, missionCode: 'P1-SPECIAL-001' }), true);
  assert.equal(isAssignmentVisibleAtStage({ taskStage: 'task_round_1', gameStage: 'registration', isInitial: false, missionCode: 'P1-DECOY-001' }), false);
  assert.equal(isAssignmentVisibleAtStage({ taskStage: 'task_round_2', gameStage: 'registration', isInitial: true, missionCode: 'P2-TRICKSTER-001' }), false);
  assert.equal(isTaskWaitingForStage('task_round_1', 'registration'), true);
  assert.equal(isTaskWaitingForStage('task_round_1', 'task_round_1'), false);
});
