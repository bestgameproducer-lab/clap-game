import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLATFORM_RUNTIME_CHECKLISTS,
  createEmptyPlatformRuntimeChecklist,
  getPlatformRuntimeChecklist,
  isPlatformRuntimeChecklistComplete,
} from '../lib/platform/runtime-readiness.ts';

test('runtime launch gates expose two closed, non-overlapping checklists', () => {
  assert.equal(PLATFORM_RUNTIME_CHECKLISTS.verification.length, 5);
  assert.equal(PLATFORM_RUNTIME_CHECKLISTS.readiness.length, 4);
  const verificationKeys = PLATFORM_RUNTIME_CHECKLISTS.verification.map((item) => item.id);
  const readinessKeys = PLATFORM_RUNTIME_CHECKLISTS.readiness.map((item) => item.id);
  assert.equal(new Set([...verificationKeys, ...readinessKeys]).size, 9);
  assert.deepEqual(getPlatformRuntimeChecklist('verification'), PLATFORM_RUNTIME_CHECKLISTS.verification);
});

test('runtime launch gates fail closed until every exact confirmation is true', () => {
  const empty = createEmptyPlatformRuntimeChecklist('verification');
  assert.equal(isPlatformRuntimeChecklistComplete('verification', empty), false);
  const complete = Object.fromEntries(Object.keys(empty).map((key) => [key, true]));
  assert.equal(isPlatformRuntimeChecklistComplete('verification', complete), true);
  assert.equal(isPlatformRuntimeChecklistComplete('verification', { ...complete, extra: true }), false);
  assert.equal(isPlatformRuntimeChecklistComplete('verification', { ...complete, manifestHashMatched: false }), false);
  assert.equal(isPlatformRuntimeChecklistComplete('readiness', complete), false);
});
