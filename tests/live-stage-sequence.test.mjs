import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_GAME_STAGE_SEQUENCE,
  isNextLiveGameStage,
  nextLiveGameStage,
} from '../lib/game-stages.ts';

test('live wedding stages advance one step at a time without skips or backtracking', () => {
  assert.deepEqual(LIVE_GAME_STAGE_SEQUENCE, [
    'registration',
    'waiting',
    'task_round_1',
    'ceremony_end',
    'task_round_2',
    'banquet',
    'group_game',
  ]);

  for (let currentIndex = 0; currentIndex < LIVE_GAME_STAGE_SEQUENCE.length; currentIndex += 1) {
    const current = LIVE_GAME_STAGE_SEQUENCE[currentIndex];
    const expected = LIVE_GAME_STAGE_SEQUENCE[currentIndex + 1] ?? null;
    assert.equal(nextLiveGameStage(current), expected);
    for (const requested of LIVE_GAME_STAGE_SEQUENCE) {
      assert.equal(
        isNextLiveGameStage(current, requested),
        requested === expected,
        `${current} must only advance to ${expected ?? 'no manual stage'}`,
      );
    }
  }
});

test('finale and unknown states cannot re-enter the manual live sequence', () => {
  for (const current of ['voting', 'results', 'unknown', null, undefined]) {
    assert.equal(nextLiveGameStage(current), null);
    for (const requested of LIVE_GAME_STAGE_SEQUENCE) {
      assert.equal(isNextLiveGameStage(current, requested), false);
    }
  }
});
