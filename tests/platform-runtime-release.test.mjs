import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLATFORM_RUNTIME_RELEASE_CHECKLISTS,
  createEmptyPlatformRuntimeReleaseChecklist,
  getPlatformRuntimeReleaseChecklist,
  isPlatformRuntimeReleaseChecklistComplete,
} from '../lib/platform/runtime-release.ts';

test('runtime release actions expose separate closed manual checklists', () => {
  assert.equal(PLATFORM_RUNTIME_RELEASE_CHECKLISTS.release.length, 6);
  assert.equal(PLATFORM_RUNTIME_RELEASE_CHECKLISTS.hold.length, 3);
  const releaseKeys = PLATFORM_RUNTIME_RELEASE_CHECKLISTS.release.map((item) => item.id);
  const holdKeys = PLATFORM_RUNTIME_RELEASE_CHECKLISTS.hold.map((item) => item.id);
  assert.equal(new Set([...releaseKeys, ...holdKeys]).size, 9);
  assert.deepEqual(getPlatformRuntimeReleaseChecklist('hold'), PLATFORM_RUNTIME_RELEASE_CHECKLISTS.hold);
});

test('runtime release actions fail closed on missing, false, or extra confirmations', () => {
  const empty = createEmptyPlatformRuntimeReleaseChecklist('release');
  assert.equal(isPlatformRuntimeReleaseChecklistComplete('release', empty), false);
  const complete = Object.fromEntries(Object.keys(empty).map((key) => [key, true]));
  assert.equal(isPlatformRuntimeReleaseChecklistComplete('release', complete), true);
  assert.equal(isPlatformRuntimeReleaseChecklistComplete('release', { ...complete, extra: true }), false);
  assert.equal(isPlatformRuntimeReleaseChecklistComplete('release', { ...complete, publicEntryVerified: false }), false);
  assert.equal(isPlatformRuntimeReleaseChecklistComplete('hold', complete), false);
});
