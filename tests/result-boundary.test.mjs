import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPublishedTeamResults } from '../lib/result-core.ts';

const members = [
  { id: 'guest-1', name: 'Guest One', role: 'guest', is_hidden_spy: false },
  { id: 'spy-1', name: 'Spy One', role: 'spy', is_hidden_spy: false },
];

test('does not expose team roles before results are published', () => {
  assert.equal(buildPublishedTeamResults(members, 'spy-1', false), null);
});

test('calculates whether the guest identified a spy after publication', () => {
  const correct = buildPublishedTeamResults(members, 'spy-1', true);
  const missed = buildPublishedTeamResults(members, 'guest-1', true);
  assert.equal(correct?.voteCorrect, true);
  assert.equal(correct?.votedTargetName, 'Spy One');
  assert.equal(missed?.voteCorrect, false);
});

test('keeps a missing vote distinct from an incorrect vote', () => {
  const result = buildPublishedTeamResults(members, null, true);
  assert.equal(result?.voteCorrect, null);
  assert.equal(result?.votedTargetName, null);
});

test('keeps hidden-spy reveal metadata inside published results', () => {
  const hiddenSpy = { id: 'hidden-spy-1', name: 'Hidden Spy', role: 'spy', is_hidden_spy: true };
  const result = buildPublishedTeamResults([...members, hiddenSpy], hiddenSpy.id, true);
  assert.equal(result?.voteCorrect, true);
  assert.equal(result?.teamMembers.find((member) => member.id === hiddenSpy.id)?.is_hidden_spy, true);
});
