import assert from 'node:assert/strict';
import test from 'node:test';
import { isTaskVisibleAtStage } from '../lib/game-rules.ts';

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
