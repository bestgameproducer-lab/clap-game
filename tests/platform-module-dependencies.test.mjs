import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPlatformModuleDependencyIssue,
  normalizePlatformModuleSelection,
  removePlatformModuleWithDependents,
} from '../lib/platform/catalog.ts';

test('selecting a dependent module adds every required foundation module in catalog order', () => {
  assert.deepEqual(normalizePlatformModuleSelection(['live-scoreboard']), [
    'team-games',
    'host-toolkit',
    'live-scoreboard',
  ]);
  assert.deepEqual(normalizePlatformModuleSelection(['finale-vote']), [
    'secret-missions',
    'finale-vote',
  ]);
});

test('removing a foundation module removes dependents but preserves unrelated modules', () => {
  assert.deepEqual(removePlatformModuleWithDependents([
    'secret-missions',
    'team-games',
    'host-toolkit',
    'live-scoreboard',
    'finale-vote',
  ], 'host-toolkit'), [
    'secret-missions',
    'finale-vote',
  ]);
  assert.deepEqual(removePlatformModuleWithDependents([
    'secret-missions',
    'host-toolkit',
    'finale-vote',
  ], 'secret-missions'), ['host-toolkit']);
});

test('dependency validation returns a customer-readable reason for invalid combinations', () => {
  assert.equal(getPlatformModuleDependencyIssue(['live-scoreboard']), '实时积分大屏需要同时启用团队互动游戏');
  assert.equal(getPlatformModuleDependencyIssue(['finale-vote']), '终局投票揭晓需要同时启用宾客秘密任务');
  assert.equal(getPlatformModuleDependencyIssue(['team-games', 'host-toolkit']), null);
});
